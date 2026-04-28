import { TicketStatus } from "../enum/TicketStatus";
import { PhaseHandler } from "../handler/PhaseHandler";
import { Ticket } from "../entity/Ticket";

export type TicketActivationContext = "ticket-create" | "monday-import" | "mcp-ticket-create" | "mcp-monday-import";

export class TicketActivationService {
  constructor(private readonly phaseHandler = new PhaseHandler()) {}

  activateCreatedIfReady(ticket: Ticket | null | undefined, context: TicketActivationContext): void {
    if (!ticket || ticket.status !== TicketStatus.READY) {
      return;
    }

    this.phaseHandler.initCreated(ticket).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`initCreated error`, { context, ticketId: ticket.id, message });
    });
  }
}
