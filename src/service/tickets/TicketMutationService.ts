import { pickCliForNewTicket } from "../../cli";
import { CliType } from "../../enum/CliType";
import { TicketPhase } from "../../enum/TicketPhase";
import { TicketStatus } from "../../enum/TicketStatus";
import { Ticket } from "../../entity/Ticket";
import { PhaseHandler } from "../../handler/PhaseHandler";
import { AppStateRepository } from "../../repository/AppStateRepository";
import { PhaseRepository } from "../../repository/PhaseRepository";
import { TicketRepository } from "../../repository/TicketRepository";
import { TicketActivationService, type TicketActivationContext } from "../TicketActivationService";

const TICKET_STATUS_VALUES = Object.values(TicketStatus) as string[];

export class TicketMutationError extends Error {
  constructor(message: string, readonly statusCode = 500) {
    super(message);
  }
}

export function parseTicketStatus(value: unknown, fallback = TicketStatus.READY): TicketStatus | null {
  if (value === undefined) return fallback;
  return typeof value === "string" && TICKET_STATUS_VALUES.includes(value)
    ? (value as TicketStatus)
    : null;
}

export function hasProcessingStarted(ticket: { uid: string | null; slotId: number | null; waitingForSlot: boolean; phases?: Array<{ startedAt: Date | null; completedAt: Date | null }> }): boolean {
  return (
    ticket.uid != null ||
    ticket.slotId != null ||
    ticket.waitingForSlot ||
    Boolean(ticket.phases?.some((phase) => phase.startedAt || phase.completedAt))
  );
}

export class TicketMutationService {
  constructor(
    private readonly ticketRepo = new TicketRepository(),
    private readonly phaseRepo = new PhaseRepository(),
    private readonly appStateRepo = new AppStateRepository(),
    private readonly phaseHandler = new PhaseHandler(),
  ) {}

  async create(input: {
    title: string;
    description?: string;
    projectId?: number | null;
    cliType?: CliType;
    status?: TicketStatus;
    activationContext: TicketActivationContext;
  }): Promise<Ticket | null> {
    const status = input.status ?? TicketStatus.READY;
    let cliType = input.cliType ?? CliType.CLAUDE;

    if (status === TicketStatus.READY) {
      const appState = await this.appStateRepo.get();
      if (appState.availableCliTypes.length === 0) {
        throw new TicketMutationError("No CLI is currently available", 409);
      }
      if (input.cliType !== undefined && !appState.availableCliTypes.includes(input.cliType)) {
        throw new TicketMutationError(`${input.cliType} is currently unavailable`, 409);
      }
      cliType = input.cliType ?? await pickCliForNewTicket(this.ticketRepo, appState.availableCliTypes);
    }

    const ticket = await this.ticketRepo.create({
      title: input.title,
      description: input.description,
      projectId: typeof input.projectId === "number" ? input.projectId : null,
      cliType,
      status,
    });

    new TicketActivationService(this.phaseHandler).activateCreatedIfReady(ticket, input.activationContext);
    return this.ticketRepo.findById(ticket.id);
  }

  async update(input: {
    id: number;
    title?: string;
    description?: string;
    currentPhase?: TicketPhase;
    status?: TicketStatus;
    enforceContentEditWindow?: boolean;
    emitAfterUpdate?: boolean;
  }): Promise<Ticket | null> {
    const existing = await this.ticketRepo.findById(input.id);
    if (!existing) {
      throw new TicketMutationError(`Ticket ${input.id} not found`, 404);
    }

    const nextStatus = input.status ?? existing.status;
    const hasTitlePatch = input.title !== undefined;
    const hasDescriptionPatch = input.description !== undefined;
    const hasContentPatch = hasTitlePatch || hasDescriptionPatch;

    if (existing.status === TicketStatus.DRAFT && input.currentPhase && input.currentPhase !== existing.currentPhase) {
      throw new TicketMutationError(`Ticket ${input.id} is draft and cannot be processed`, 409);
    }

    if (existing.status === TicketStatus.READY && nextStatus === TicketStatus.DRAFT && hasProcessingStarted(existing)) {
      throw new TicketMutationError(`Ticket ${input.id} has already started processing and cannot be moved to draft`, 409);
    }

    if (existing.status === TicketStatus.DRAFT && nextStatus === TicketStatus.READY) {
      const appState = await this.appStateRepo.get();
      if (appState.availableCliTypes.length === 0) {
        throw new TicketMutationError("No CLI is currently available", 409);
      }
      if (!appState.availableCliTypes.includes(existing.cliType)) {
        throw new TicketMutationError(`${existing.cliType} is currently unavailable`, 409);
      }
    }

    if (input.enforceContentEditWindow && hasContentPatch && !existing.waitingForSlot) {
      throw new TicketMutationError("Ticket content can only be edited while waiting for a slot", 409);
    }

    if (input.currentPhase && input.currentPhase !== existing.currentPhase) {
      const activePhase = await this.phaseRepo.findActiveByTicketId(input.id);
      if (activePhase) {
        await this.phaseRepo.update(activePhase.id, { completedAt: new Date() });
      }
      const pending = await this.phaseRepo.findPendingByTicketIdAndName(input.id, input.currentPhase);
      if (pending) {
        await this.phaseRepo.activate(pending.id);
      }
    }

    await this.ticketRepo.update(input.id, {
      title: input.title,
      description: input.description,
      currentPhase: input.currentPhase,
      status: nextStatus === existing.status || (existing.status === TicketStatus.DRAFT && nextStatus === TicketStatus.READY)
        ? undefined
        : nextStatus,
    });

    if (existing.status === TicketStatus.DRAFT && nextStatus === TicketStatus.READY) {
      return this.phaseHandler.publish(input.id);
    }

    const full = await this.ticketRepo.findById(input.id);
    // ticket.updated emitted automatically by TicketSubscriber.afterUpdate
    return full;
  }
}
