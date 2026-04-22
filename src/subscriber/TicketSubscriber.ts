import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from "typeorm";
import { Ticket } from "../entity/Ticket";
import { Phase } from "../entity/Phase";
import { TicketPhase } from "../enum/TicketPhase";

const ALL_PHASES: TicketPhase[] = [
  TicketPhase.CREATED,
  TicketPhase.BRAINSTORM,
  TicketPhase.PLANNING,
  TicketPhase.IMPLEMENTATION,
  TicketPhase.SHIP,
];

@EventSubscriber()
export class TicketSubscriber implements EntitySubscriberInterface<Ticket> {
  listenTo() {
    return Ticket;
  }

  async afterInsert(event: InsertEvent<Ticket>): Promise<void> {
    const ticketId = event.entity.id;
    const now = new Date();

    const phases = ALL_PHASES.map((phaseName) =>
      event.manager.create(Phase, {
        ticketId,
        phaseName,
        startedAt: phaseName === TicketPhase.CREATED ? now : null,
        completedAt: null,
      })
    );

    await event.manager.save(Phase, phases);
    // Slot assignment and workspace setup are handled by PhaseHandler.handleCreated,
    // called from the POST /api/tickets route after the insert transaction commits.
  }
}
