import { execSync } from "child_process";
import { PhaseStatus } from "../enum/PhaseStatus";
import { AssistantActionRepository } from "./AssistantRepository";
import type { Phase } from "../entity/Phase";
import type { Slot } from "../entity/Slot";

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

const PROTECTED_BRANCHES = ["main", "master", "dev"];

export interface PolicyResult {
  allowed: boolean;
  reason: string;
}

export class AssistantPolicyService {
  private actionRepo: AssistantActionRepository;

  constructor() {
    this.actionRepo = new AssistantActionRepository();
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

  async canRebaseAndContinue(
    phase: Phase,
    slot: Slot,
    fingerprint: string,
  ): Promise<PolicyResult> {
    if (!slot.rootPath) {
      return { allowed: false, reason: "No workspace root path for slot" };
    }

    let currentBranch: string;
    let gitStatus: string;

    try {
      currentBranch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: slot.rootPath,
        encoding: "utf8",
      }).trim();
    } catch {
      return { allowed: false, reason: "Could not determine current git branch" };
    }

    if (PROTECTED_BRANCHES.includes(currentBranch)) {
      return { allowed: false, reason: `Branch "${currentBranch}" is protected; will not rebase` };
    }

    try {
      gitStatus = execSync("git status --porcelain", {
        cwd: slot.rootPath,
        encoding: "utf8",
      }).trim();
    } catch {
      return { allowed: false, reason: "Could not read git status" };
    }

    if (gitStatus.length > 0) {
      return { allowed: false, reason: "Working tree has uncommitted changes" };
    }

    try {
      execSync("git fetch origin dev --quiet", { cwd: slot.rootPath });
    } catch {
      return { allowed: false, reason: "Could not fetch origin/dev" };
    }

    let behindCount: string;
    try {
      behindCount = execSync(`git rev-list HEAD..origin/dev --count`, {
        cwd: slot.rootPath,
        encoding: "utf8",
      }).trim();
    } catch {
      return { allowed: false, reason: "Could not check if branch is behind origin/dev" };
    }

    if (parseInt(behindCount, 10) === 0) {
      return { allowed: false, reason: "Branch is not behind origin/dev; no rebase needed" };
    }

    // Dry-run rebase to check for conflicts
    try {
      execSync("git rebase --dry-run origin/dev 2>&1 || true", {
        cwd: slot.rootPath,
        encoding: "utf8",
        shell: "bash",
      });
    } catch {
      // dry-run detected conflict — abort any in-progress rebase
      try {
        execSync("git rebase --abort", { cwd: slot.rootPath });
      } catch {}
      return { allowed: false, reason: "Rebase dry-run detected conflicts; manual resolution required" };
    }

    const alreadyAttempted = await this.actionRepo.existsByFingerprint(fingerprint);
    if (alreadyAttempted) {
      return { allowed: false, reason: "Rebase already attempted for this event" };
    }

    return { allowed: true, reason: "Clean rebase onto origin/dev is safe" };
  }
}
