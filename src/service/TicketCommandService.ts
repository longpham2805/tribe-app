import { pickCliForNewTicket } from "../cli";
import { Ticket } from "../entity/Ticket";
import { CliType } from "../enum/CliType";
import { TicketPhase } from "../enum/TicketPhase";
import { TicketStatus } from "../enum/TicketStatus";
import { PhaseHandler, type TriggerResult } from "../handler/PhaseHandler";
import { AppStateRepository } from "../repository/AppStateRepository";
import { TicketRepository } from "../repository/TicketRepository";
import { TicketActivationService, type TicketActivationContext } from "./TicketActivationService";

export type CreateTicketInput = {
  title: string;
  description?: string;
  projectId?: number | null;
  cliType?: CliType;
  status?: TicketStatus;
  activationContext?: TicketActivationContext;
};

export class TicketCommandService {
  constructor(
    private readonly ticketRepo = new TicketRepository(),
    private readonly appStateRepo = new AppStateRepository(),
    private readonly phaseHandler = new PhaseHandler(),
    private readonly activationService = new TicketActivationService(),
  ) {}

  async list(input: { phase?: TicketPhase; projectId?: number }): Promise<Ticket[]> {
    const opts = input.projectId != null ? { projectId: input.projectId } : undefined;
    return input.phase
      ? this.ticketRepo.findByPhase(input.phase, opts)
      : this.ticketRepo.findAll(opts);
  }

  async create(input: CreateTicketInput): Promise<Ticket | null> {
    const status = input.status ?? TicketStatus.READY;
    let cliType = input.cliType ?? CliType.CLAUDE;

    if (status === TicketStatus.READY) {
      const appState = await this.appStateRepo.get();
      if (appState.availableCliTypes.length === 0) {
        throw new Error("No CLI is currently available");
      }
      if (input.cliType && !appState.availableCliTypes.includes(input.cliType)) {
        throw new Error(`${input.cliType} is currently unavailable`);
      }
      cliType = input.cliType ?? await pickCliForNewTicket(this.ticketRepo, appState.availableCliTypes);
    }

    const ticket = await this.ticketRepo.create({
      title: input.title,
      description: input.description,
      projectId: input.projectId ?? null,
      cliType,
      status,
    });

    this.activationService.activateCreatedIfReady(ticket, input.activationContext ?? "ticket-create");
    return this.ticketRepo.findById(ticket.id);
  }

  async publish(input: { ticketId: number }): Promise<Ticket> {
    return this.phaseHandler.publish(input.ticketId);
  }

  async trigger(input: { ticketId: number; phaseName: TicketPhase }): Promise<TriggerResult> {
    return this.phaseHandler.trigger(input.ticketId, input.phaseName);
  }

  async respond(input: { ticketId: number; message: string }): Promise<TriggerResult> {
    return this.phaseHandler.respond(input.ticketId, input.message);
  }
}
