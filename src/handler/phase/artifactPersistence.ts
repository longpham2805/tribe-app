import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { Phase } from "../../entity/Phase";
import { Ticket } from "../../entity/Ticket";
import { TicketRepository } from "../../repository/TicketRepository";
import { dedupePullRequestArtifacts, getPullRequestArtifactKey, parseShipArtifacts, type PullRequestArtifact } from "./artifacts";

type UpdatePhase = (phaseId: number, data: Partial<Phase>) => Promise<Phase | null>;
type EmitTicket = (ticketId: number) => Promise<void>;
type Log = (message: string) => void;

export async function persistShipArtifacts(
  ticketRepo: TicketRepository,
  ticket: Ticket,
  shipOutputPath: string,
  log: Log,
): Promise<PullRequestArtifact[]> {
  if (!existsSync(shipOutputPath)) {
    log(`ship output missing at ${shipOutputPath} — skipping artifact persistence`);
    return [];
  }

  const shipContent = readFileSync(shipOutputPath, "utf-8");
  const { branchName, pullRequests } = parseShipArtifacts(shipContent);
  const dedupedPullRequests = dedupePullRequestArtifacts(pullRequests);
  await ticketRepo.update(ticket.id, {
    branchName,
    pullRequests: dedupedPullRequests.length ? dedupedPullRequests : null,
  });
  return dedupedPullRequests;
}

export function autoMergeShipPRs(pullRequests: PullRequestArtifact[], log: Log): void {
  if (!pullRequests.length) return;

  for (const pr of pullRequests) {
    log(`fast-track: merging PR ${pr.prUrl}`);
    const result = spawnSync("gh", ["pr", "merge", pr.prUrl, "--squash", "--delete-branch"], {
      encoding: "utf-8",
      timeout: 60_000,
    });
    if (result.status === 0) {
      log(`fast-track: merged ${pr.prUrl}`);
    } else {
      log(`fast-track: merge failed for ${pr.prUrl} — ${result.stderr?.trim() ?? "unknown error"}`);
    }
  }
}

export async function persistFeedbackArtifacts({
  ticketRepo,
  ticket,
  phase,
  feedbackOutputPath,
  updatePhase,
  emitTicket,
  log,
}: {
  ticketRepo: TicketRepository;
  ticket: Ticket;
  phase: Phase;
  feedbackOutputPath: string;
  updatePhase: UpdatePhase;
  emitTicket: EmitTicket;
  log: Log;
}): Promise<void> {
  if (!existsSync(feedbackOutputPath)) {
    log(`feedback output missing at ${feedbackOutputPath} — skipping artifact persistence`);
    return;
  }

  const feedbackContent = readFileSync(feedbackOutputPath, "utf-8");
  const { branchName, pullRequests } = parseShipArtifacts(feedbackContent);
  const dedupedPullRequests = dedupePullRequestArtifacts(pullRequests);
  const phasePatch: Partial<Phase> = {};
  if (branchName) phasePatch.branchName = branchName;
  if (dedupedPullRequests.length) phasePatch.pullRequests = dedupedPullRequests;
  if (Object.keys(phasePatch).length) {
    await updatePhase(phase.id, phasePatch);
  }

  if (!dedupedPullRequests.length) return;

  const freshTicket = await ticketRepo.findById(ticket.id);
  const existing = dedupePullRequestArtifacts(freshTicket?.pullRequests ?? ticket.pullRequests ?? []);
  const byKey = new Map<string, PullRequestArtifact>();
  for (const pr of existing) {
    byKey.set(getPullRequestArtifactKey(pr), pr);
  }
  for (const pr of dedupedPullRequests) {
    byKey.set(getPullRequestArtifactKey(pr), pr);
  }

  await ticketRepo.update(ticket.id, {
    pullRequests: [...byKey.values()],
  });
  await emitTicket(ticket.id);
}
