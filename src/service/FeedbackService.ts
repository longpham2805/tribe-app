import { Ticket } from "../entity/Ticket";
import { TicketPhase } from "../enum/TicketPhase";
import { PhaseStatus } from "../enum/PhaseStatus";
import { TicketStatus } from "../enum/TicketStatus";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { SlotService } from "./SlotService";
import { PhaseHandler } from "../handler/PhaseHandler";
import { emit } from "../lib/events";

export class FeedbackService {
  private ticketRepo: TicketRepository;
  private phaseRepo: PhaseRepository;

  constructor() {
    this.ticketRepo = new TicketRepository();
    this.phaseRepo = new PhaseRepository();
  }

  async create(ticketId: number, comment: string): Promise<Ticket> {
    const trimmedComment = comment.trim();
    if (!trimmedComment) {
      throw new Error("feedback comment is required");
    }

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
    if (ticket.status === TicketStatus.DRAFT) {
      throw new Error(`Ticket ${ticketId} is draft and cannot receive feedback`);
    }

    const hasPullRequest = (ticket.pullRequests?.length ?? 0) > 0;
    if (!ticket.isDone && !hasPullRequest) {
      throw new Error(`Ticket ${ticketId} has no shipped PR to review`);
    }

    const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
    if (activePhase) {
      throw new Error(`Ticket ${ticketId} already has an active phase`);
    }
    const pendingFeedback = await this.phaseRepo.findPendingByTicketIdAndName(ticketId, TicketPhase.FEEDBACK);
    if (pendingFeedback) {
      throw new Error(`Ticket ${ticketId} already has pending feedback`);
    }

    const maxSequence = await this.phaseRepo.findMaxSequenceByTicketIdAndName(ticketId, TicketPhase.FEEDBACK);
    await this.phaseRepo.create({
      ticketId,
      phaseName: TicketPhase.FEEDBACK,
      sequence: maxSequence + 1,
      feedbackComment: trimmedComment,
      status: PhaseStatus.PENDING,
      startedAt: null,
    });

    await this.ticketRepo.update(ticketId, {
      currentPhase: TicketPhase.FEEDBACK,
      isDone: false,
    });

    const refreshed = await this.ticketRepo.findById(ticketId);
    if (!refreshed) throw new Error(`Ticket ${ticketId} not found after feedback creation`);
    emit({ type: "ticket.updated", ticket: refreshed });

    if (refreshed.slotId != null) {
      const handler = new PhaseHandler();
      await handler.trigger(ticketId, TicketPhase.FEEDBACK);
      return (await this.ticketRepo.findById(ticketId)) ?? refreshed;
    }

    await this.ticketRepo.updateSlotFields(ticketId, {
      slotId: null,
      waitingForSlot: true,
    });

    const queued = await this.ticketRepo.findById(ticketId);
    if (queued) emit({ type: "ticket.updated", ticket: queued });

    const assigned = await new SlotService().tryAssign(queued ?? refreshed);
    if (assigned) {
      const assignedTicket = await this.ticketRepo.findById(ticketId);
      if (assignedTicket) {
        await new PhaseHandler().trigger(ticketId, TicketPhase.FEEDBACK);
        return (await this.ticketRepo.findById(ticketId)) ?? assignedTicket;
      }
    }

    return (await this.ticketRepo.findById(ticketId)) ?? refreshed;
  }
}
