import { CliType } from "../enum/CliType";
import { TicketStatus } from "../enum/TicketStatus";
import { pickCliForNewTicket } from "../cli";
import { runTicketImportedHooks } from "../hooks/registry";
import { formatItemMarkdown } from "../monday/formatItemMarkdown";
import { MondayHelper } from "../monday/MondayHelper";
import { type MondayItemDetail } from "../monday/types";
import { AppStateRepository } from "../repository/AppStateRepository";
import { ProjectRepository } from "../repository/ProjectRepository";
import { TicketRepository } from "../repository/TicketRepository";
import { Ticket } from "../entity/Ticket";
import { TicketActivationService, type TicketActivationContext } from "./TicketActivationService";
import { hasProcessingStarted } from "./tickets/TicketMutationService";

export type MondayImportInput = {
  mondayItemId: string;
  projectId?: number | null;
  status?: TicketStatus;
  cliType?: CliType;
  clues?: string;
  titleOverride?: string;
  activationContext?: TicketActivationContext;
};

export type MondayImportResult = {
  action: "created" | "updated";
  ticket: Ticket | null;
  mondayMarkdown: string;
};

function parseBoardId(boardId: string | undefined): number | undefined {
  if (!boardId) return undefined;
  const parsed = Number(boardId);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export class MondayImportService {
  constructor(
    private readonly ticketRepo = new TicketRepository(),
    private readonly projectRepo = new ProjectRepository(),
    private readonly appStateRepo = new AppStateRepository(),
    private readonly activationService = new TicketActivationService(),
  ) {}

  private async resolveCliType(input: {
    requestedCliType?: CliType;
    status: TicketStatus;
    existing?: Ticket | null;
  }): Promise<CliType> {
    const appState = await this.appStateRepo.get();

    if (input.requestedCliType !== undefined) {
      if (input.status === TicketStatus.READY && !appState.availableCliTypes.includes(input.requestedCliType)) {
        throw new Error(`${input.requestedCliType} is currently unavailable`);
      }
      return input.requestedCliType;
    }

    if (input.existing) {
      if (input.status !== TicketStatus.READY || appState.availableCliTypes.includes(input.existing.cliType) || hasProcessingStarted(input.existing)) {
        return input.existing.cliType;
      }
    }

    if (appState.availableCliTypes.length === 0) {
      if (input.status === TicketStatus.READY) {
        throw new Error("No CLI is currently available");
      }
      return input.existing?.cliType ?? CliType.CLAUDE;
    }

    return pickCliForNewTicket(this.ticketRepo, appState.availableCliTypes);
  }

  async importTicket(input: MondayImportInput): Promise<MondayImportResult> {
    const status = input.status ?? TicketStatus.READY;
    const project = input.projectId != null ? await this.projectRepo.findById(input.projectId) : null;
    if (input.projectId != null && !project) {
      throw new Error(`Project ${input.projectId} not found`);
    }

    const monday = project
      ? new MondayHelper({
          accessToken: process.env.MONDAY_ACCESS_TOKEN,
          apiUrl: process.env.MONDAY_API_URL,
          defaultBoardIds: project.mondayBoardIds ?? undefined,
          ewebinarDevPeople: project.mondayDevPeople ?? undefined,
        })
      : MondayHelper.fromEnv();
    const { item } = await monday.getItemDetails(input.mondayItemId);

    if (project?.mondayBoardIds?.length) {
      const boardId = parseBoardId(item.board?.id);
      if (boardId == null || !project.mondayBoardIds.includes(boardId)) {
        throw new Error(`Monday item ${item.id} does not belong to project ${project.name}.`);
      }
    }

    return this.upsert(item, input, status);
  }

  private async upsert(
    item: MondayItemDetail,
    input: MondayImportInput,
    status: TicketStatus,
  ): Promise<MondayImportResult> {
    const mondayMarkdown = formatItemMarkdown(item);
    const mondayBoardId = parseBoardId(item.board?.id);
    const description = input.clues && input.clues.trim() ? input.clues.trim() : undefined;
    const title = input.titleOverride && input.titleOverride.trim() ? input.titleOverride.trim() : item.name;
    const existing = await this.ticketRepo.findByMondayItemId(item.id);
    const cliType = await this.resolveCliType({
      requestedCliType: input.cliType,
      status,
      existing,
    });

    let ticket: Ticket | null;
    let action: "created" | "updated";

    if (existing) {
      ticket = await this.ticketRepo.update(existing.id, {
        title,
        mondayItemId: item.id,
        mondayBoardId,
        mondayMarkdown,
        status,
        ...(!hasProcessingStarted(existing) && existing.cliType !== cliType ? { cliType } : {}),
        ...(description !== undefined ? { description } : {}),
      });
      action = "updated";
    } else {
      const created = await this.ticketRepo.create({
        title,
        mondayItemId: item.id,
        mondayBoardId,
        mondayMarkdown,
        description,
        projectId: input.projectId ?? null,
        status,
        cliType,
      });
      ticket = await this.ticketRepo.findById(created.id);
      action = "created";
    }

    if (ticket && ticket.status === TicketStatus.READY) {
      await runTicketImportedHooks(ticket, item);
    }
    if (action === "created") {
      this.activationService.activateCreatedIfReady(ticket, input.activationContext ?? "monday-import");
    }

    return { action, ticket, mondayMarkdown };
  }
}
