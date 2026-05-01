import { PhaseStatus } from "../enum/PhaseStatus";
import { AssistantActionRepository } from "./AssistantRepository";
import type { Phase } from "../entity/Phase";

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
}
