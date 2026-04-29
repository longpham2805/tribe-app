import { existsSync, readFileSync } from "fs";
import { Phase } from "../../entity/Phase";
import { Ticket } from "../../entity/Ticket";
import { TicketRepository } from "../../repository/TicketRepository";
import { parseShipArtifacts, type PullRequestArtifact } from "./artifacts";

type UpdatePhase = (phaseId: number, data: Partial<Phase>) => Promise<Phase | null>;
type EmitTicket = (ticketId: number) => Promise<void>;
type Log = (message: string) => void;

export async function persistShipArtifacts(
  ticketRepo: TicketRepository,
  ticket: Ticket,
  shipOutputPath: string,
  log: Log,
): Promise<void> {
  if (!existsSync(shipOutputPath)) {
    log(`ship output missing at ${shipOutputPath} — skipping artifact persistence`);
    return;
  }

  const shipContent = readFileSync(shipOutputPath, "utf-8");
  const { branchName, pullRequests } = parseShipArtifacts(shipContent);
  await ticketRepo.update(ticket.id, {
    branchName,
    pullRequests: pullRequests.length ? pullRequests : null,
  });
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
  const phasePatch: Partial<Phase> = {};
  if (branchName) phasePatch.branchName = branchName;
  if (pullRequests.length) phasePatch.pullRequests = pullRequests;
  if (Object.keys(phasePatch).length) {
    await updatePhase(phase.id, phasePatch);
  }

  if (!pullRequests.length) return;

  const freshTicket = await ticketRepo.findById(ticket.id);
  const existing = freshTicket?.pullRequests ?? ticket.pullRequests ?? [];
  const byUrl = new Map<string, PullRequestArtifact>();
  for (const pr of existing) {
    byUrl.set(pr.prUrl, pr);
  }
  for (const pr of pullRequests) {
    byUrl.set(pr.prUrl, pr);
  }

  await ticketRepo.update(ticket.id, {
    pullRequests: [...byUrl.values()],
  });
  await emitTicket(ticket.id);
}
