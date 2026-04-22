import { TicketPhase } from "../enum/TicketPhase";
import { Ticket } from "../entity/Ticket";
import { Phase } from "../entity/Phase";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { SlotRepository } from "../repository/SlotRepository";
import { SlotService } from "../service/SlotService";

export interface TriggerResult {
  ticket: Ticket;
  phase: Phase;
}

export class PhaseHandler {
  private ticketRepo: TicketRepository;
  private phaseRepo: PhaseRepository;

  constructor() {
    this.ticketRepo = new TicketRepository();
    this.phaseRepo = new PhaseRepository();
  }

  /**
   * Transition a ticket into the given phase and run the phase-specific handler.
   * Completes the currently active phase, activates the pending target phase,
   * updates ticket.currentPhase, then dispatches to the appropriate handler method.
   */
  async trigger(ticketId: number, phaseName: TicketPhase): Promise<TriggerResult> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    if (ticket.currentPhase !== phaseName) {
      const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
      if (activePhase) {
        await this.phaseRepo.update(activePhase.id, { completedAt: new Date() });
      }

      const pending = await this.phaseRepo.findPendingByTicketIdAndName(ticketId, phaseName);
      if (pending) {
        await this.phaseRepo.activate(pending.id);
      }

      await this.ticketRepo.update(ticketId, { currentPhase: phaseName });
    }

    const updatedTicket = (await this.ticketRepo.findById(ticketId))!;
    const activePhase = (await this.phaseRepo.findActiveByTicketId(ticketId))!;

    await this.dispatch(phaseName, updatedTicket);

    return { ticket: updatedTicket, phase: activePhase };
  }

  private async dispatch(phaseName: TicketPhase, ticket: Ticket): Promise<void> {
    switch (phaseName) {
      case TicketPhase.CREATED:
        return this.handleCreated(ticket);
      case TicketPhase.BRAINSTORM:
        return this.handleBrainstorm(ticket);
      case TicketPhase.PLANNING:
        return this.handlePlanning(ticket);
      case TicketPhase.IMPLEMENTATION:
        return this.handleImplementation(ticket);
      case TicketPhase.SHIP:
        return this.handleShip(ticket);
    }
  }

  // ── Phase handlers ────────────────────────────────────────────────
  // Each method is the extension point for phase-specific logic.

  protected async handleCreated(ticket: Ticket): Promise<void> {
    // TODO: handle CREATED phase logic
  }

  protected async handleBrainstorm(ticket: Ticket): Promise<void> {
    // TODO: handle BRAINSTORM phase logic
  }

  protected async handlePlanning(ticket: Ticket): Promise<void> {
    // TODO: handle PLANNING phase logic
  }

  protected async handleImplementation(ticket: Ticket): Promise<void> {
    // TODO: handle IMPLEMENTATION phase logic
  }

  protected async handleShip(ticket: Ticket): Promise<void> {
    if (ticket.slotId == null) return;

    const slotRepo = new SlotRepository();
    const slot = await slotRepo.findById(ticket.slotId);
    if (!slot) return;

    const slotService = new SlotService();
    await slotService.releaseAndPromoteQueue(slot);
  }
}
