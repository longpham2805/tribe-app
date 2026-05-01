import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
  RemoveEvent,
} from "typeorm";
import { Ticket } from "../entity/Ticket";
import { Phase } from "../entity/Phase";
import { TicketPhase } from "../enum/TicketPhase";
import { TicketStatus } from "../enum/TicketStatus";
import { emit } from "../lib/events";

const ALL_PHASES: TicketPhase[] = [
  TicketPhase.CREATED,
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
    const isReady = event.entity.status === TicketStatus.READY;

    const phases = ALL_PHASES.map((phaseName) =>
      event.manager.create(Phase, {
        ticketId,
        phaseName,
        startedAt: isReady && phaseName === TicketPhase.CREATED ? now : null,
        completedAt: null,
      })
    );

    await event.manager.save(Phase, phases);

    const full = await event.manager.findOne(Ticket, {
      where: { id: ticketId },
      relations: ["phases"],
    });
    if (full) emit({ type: "ticket.updated", ticket: full });
  }

  async afterUpdate(event: UpdateEvent<Ticket>): Promise<void> {
    const ticketId = (event.entity as Ticket | undefined)?.id ?? (event.databaseEntity as Ticket | undefined)?.id;
    if (!ticketId) return;
    const full = await event.manager.findOne(Ticket, {
      where: { id: ticketId },
      relations: ["phases"],
    });
    if (full) emit({ type: "ticket.updated", ticket: full });
  }

  beforeRemove(event: RemoveEvent<Ticket>): void {
    const ticketId = event.entity?.id;
    if (ticketId) emit({ type: "ticket.deleted", ticketId });
  }
}
