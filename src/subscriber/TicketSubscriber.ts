import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from "typeorm";
import { Ticket } from "../entity/Ticket";
import { Phase } from "../entity/Phase";
import { TicketPhase } from "../enum/TicketPhase";
import { SlotService } from "../service/SlotService";

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

    // Auto-assign a free workspace slot (or queue the ticket if none available)
    try {
      const slotService = new SlotService();
      await slotService.tryAssign(event.entity);
    } catch (err) {
      console.error("[TicketSubscriber] Slot assignment failed:", err);
    }
  }
}
