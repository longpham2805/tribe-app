import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from "typeorm";
import { Ticket } from "../entity/Ticket";
import { Phase } from "../entity/Phase";
import { TicketPhase } from "../enum/TicketPhase";
import { SlotService } from "../service/SlotService";
import { PhaseHandler } from "../handler/PhaseHandler";

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
    let assignedSlot = null;
    try {
      const slotService = new SlotService();
      assignedSlot = await slotService.tryAssign(event.entity);
    } catch (err) {
      console.error("[TicketSubscriber] Slot assignment failed:", err);
    }

    // Set up workspace folder now that we have a slot
    if (assignedSlot) {
      try {
        const ticket = await event.manager.findOne(Ticket, {
          where: { id: ticketId },
        });
        if (ticket) {
          const handler = new PhaseHandler();
          await handler.initCreated(ticket);
        }
      } catch (err) {
        console.error("[TicketSubscriber] handleCreated failed:", err);
      }
    }
  }
}
