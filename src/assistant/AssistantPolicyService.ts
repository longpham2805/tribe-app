import { PhaseStatus } from "../enum/PhaseStatus";
import { AssistantActionRepository } from "./AssistantRepository";
import type { Phase } from "../entity/Phase";
import { ProjectRepository } from "../repository/ProjectRepository";
import { SlotRepository } from "../repository/SlotRepository";
import type { ProjectSlotPolicyDecision, ProjectSlotWriteIntent } from "../tools/projectSlotContracts";

const TRANSIENT_ERROR_PATTERNS = [
  /network/i,
  /timeout/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /socket hang up/i,
  /non-zero exit/i,
  /spawn.*ENOENT/i,
  /rate.?limit/i,
  /overloaded/i,
];

export interface PolicyResult {
  allowed: boolean;
  reason: string;
}

export class AssistantPolicyService {
  private actionRepo: AssistantActionRepository;
  private projectRepo: ProjectRepository;
  private slotRepo: SlotRepository;

  constructor() {
    this.actionRepo = new AssistantActionRepository();
    this.projectRepo = new ProjectRepository();
    this.slotRepo = new SlotRepository();
  }

  async canRetryPhase(phase: Phase, autoRetryFingerprint: string): Promise<PolicyResult> {
    if (phase.status !== PhaseStatus.ERROR) {
      return { allowed: false, reason: `Phase status is ${phase.status}, not ERROR` };
    }

    const errorMsg = phase.lastMessage ?? "";
    const isTransient = TRANSIENT_ERROR_PATTERNS.some((p) => p.test(errorMsg));
    if (!isTransient) {
      return {
        allowed: false,
        reason: `Error does not match transient patterns. Manual review required.`,
      };
    }

    const alreadyRetried = await this.actionRepo.existsByFingerprint(autoRetryFingerprint);
    if (alreadyRetried) {
      return { allowed: false, reason: "Auto-retry already attempted for this error instance" };
    }

    return { allowed: true, reason: "Transient error, safe to auto-retry" };
  }

  async classifyProjectSlotWrite(intent: ProjectSlotWriteIntent): Promise<ProjectSlotPolicyDecision> {
    if (intent.operation === "create_project") {
      return {
        allowed: true,
        requiresApproval: false,
        reason: "Project creation is a low-risk additive write.",
        blastRadius: "low",
      };
    }

    if (intent.operation === "create_slot") {
      return {
        allowed: true,
        requiresApproval: false,
        reason: "Slot creation is a low-risk additive write when rootPath is absolute.",
        blastRadius: "low",
      };
    }

    if (intent.operation === "update_slot") {
      const slot = await this.slotRepo.findById(intent.slotId);
      if (!slot) {
        return { allowed: false, requiresApproval: false, reason: `Slot ${intent.slotId} not found.`, blastRadius: "low" };
      }

      const riskyFields = [
        intent.input.rootPath !== undefined ? "rootPath" : null,
        intent.input.projectId !== undefined ? "projectId" : null,
      ].filter((field): field is string => field !== null);

      if (slot.currentTicketId != null && riskyFields.length > 0) {
        return {
          allowed: true,
          requiresApproval: true,
          reason: `Slot ${intent.slotId} is occupied by ticket #${slot.currentTicketId}; updating ${riskyFields.join(", ")} can reroute active work.`,
          blastRadius: "high",
        };
      }

      return {
        allowed: true,
        requiresApproval: false,
        reason: "Slot update is safe because the slot is free or only non-routing fields change.",
        blastRadius: riskyFields.length > 0 ? "medium" : "low",
      };
    }

    const project = await this.projectRepo.findByIdWithActivity(intent.projectId);
    if (!project) {
      return { allowed: false, requiresApproval: false, reason: `Project ${intent.projectId} not found.`, blastRadius: "low" };
    }

    const riskyFields = ["name", "slug", "mondayBoardIds", "mondayDefaultPersonId", "mondayDevPeople", "rules", "techStack", "fastTrack"]
      .filter((field) => Object.prototype.hasOwnProperty.call(intent.input, field));

    if (project.hasRunningTickets && riskyFields.length > 0) {
      return {
        allowed: true,
        requiresApproval: true,
        reason: `Project ${intent.projectId} has ${project.runningTicketCount} running ticket(s); updating ${riskyFields.join(", ")} can alter active workflow behavior.`,
        blastRadius: "high",
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      reason: "Project update does not affect running workflow-sensitive fields.",
      blastRadius: riskyFields.length > 0 ? "medium" : "low",
    };
  }
}
