import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { CliType } from "../enum/CliType";
import { PhaseStatus } from "../enum/PhaseStatus";
import { TicketPhase } from "../enum/TicketPhase";
import { TicketStatus } from "../enum/TicketStatus";
import { PhaseHandler } from "../handler/PhaseHandler";
import { emit } from "../lib/events";
import { getLogFile, getTicketDir } from "../lib/paths";
import { MondayHelper } from "../monday/MondayHelper";
import { AppStateRepository } from "../repository/AppStateRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { ProjectRepository } from "../repository/ProjectRepository";
import { SlotRepository } from "../repository/SlotRepository";
import { TicketRepository } from "../repository/TicketRepository";
import { MondayImportService } from "../service/MondayImportService";
import { TicketActivationService, type TicketActivationContext } from "../service/TicketActivationService";
import { TicketMutationError, TicketMutationService } from "../service/tickets/TicketMutationService";
import { AssistantMessageRepository } from "../assistant/AssistantRepository";
import { AssistantPolicyService } from "../assistant/AssistantPolicyService";
import { PauseQuestionContextProvider } from "../assistant/PauseQuestionContextProvider";
import { ProjectSlotWriteService } from "./ProjectSlotWriteService";
import type { ProjectSlotWriteIntent } from "./projectSlotContracts";
import { buildToolSchema } from "./schema";
import type {
  AnthropicToolInputSchema,
  PendingToolConfirmation,
  ToolCommand,
  ToolCommandResult,
  ToolConfirmation,
  ToolExecutionContext,
  ToolField,
} from "./types";
import { ToolCommandError } from "./types";

const MAX_PHASE_LOG_BYTES = 256 * 1024;
const PHASE_VALUES = Object.values(TicketPhase) as string[];
const TICKET_STATUS_VALUES = Object.values(TicketStatus) as string[];
const CLI_TYPE_VALUES = Object.values(CliType) as string[];

const str = (description: string, opts: Partial<ToolField> = {}): ToolField => ({ type: "string", description, ...opts });
const num = (description: string, opts: Partial<ToolField> = {}): ToolField => ({ type: "number", description, ...opts });
const bool = (description: string, opts: Partial<ToolField> = {}): ToolField => ({ type: "boolean", description, ...opts });
const arr = (description: string, items: ToolField, opts: Partial<ToolField> = {}): ToolField => ({ type: "array", description, items, ...opts });
const obj = (description: string, opts: Partial<ToolField> = {}): ToolField => ({ type: "object", description, ...opts });
const phaseEnum = (description: string, opts: Partial<ToolField> = {}): ToolField => ({ type: "string", enum: PHASE_VALUES, description, ...opts });
const statusEnum = (description: string, opts: Partial<ToolField> = {}): ToolField => ({ type: "string", enum: TICKET_STATUS_VALUES, description, ...opts });
const cliEnum = (description: string, opts: Partial<ToolField> = {}): ToolField => ({ type: "string", enum: CLI_TYPE_VALUES, description, ...opts });

function isAssistantSource(ctx: ToolExecutionContext): boolean {
  return ctx.source === "assistant_chat" || ctx.source === "assistant_auto";
}

function shouldConfirm(ctx: ToolExecutionContext): boolean {
  return isAssistantSource(ctx) && !ctx.confirmed;
}

function redactLogText(text: string): string {
  return text
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/\b(api[_-]?key|token|password|secret|credential|cookie)\b\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
}

function decorateSlot(slot: any) {
  return {
    ...slot,
    status: slot.disabled ? "disabled" : slot.currentTicketId ? "occupied" : "free",
  };
}

function activationContextFor(source: ToolExecutionContext["source"], restContext: TicketActivationContext, mcpContext: TicketActivationContext): TicketActivationContext {
  return source === "mcp" ? mcpContext : restContext;
}

function statusCodeForError(error: unknown): number {
  if (error instanceof ToolCommandError) return error.statusCode;
  if (error instanceof TicketMutationError) return error.statusCode;
  const message = error instanceof Error ? error.message : String(error);
  if (/not found/i.test(message)) return 404;
  if (/conflicts|currently unavailable|No CLI|is draft|occupied|already has/i.test(message)) return 409;
  if (/must be|required|Invalid|awaiting a response|has no active phase|has no CLI session ID/i.test(message)) return 400;
  return 500;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mapProjectSlotError(message: string): number {
  if (/not found/i.test(message)) return 404;
  if (/conflicts/i.test(message)) return 409;
  return 400;
}

function normalizeTicketTitle(value: unknown): string {
  if (typeof value !== "string") throw new ToolCommandError("title is required", 400);
  const title = value.trim();
  if (!title || title.length > 255) {
    throw new ToolCommandError("title must be a non-empty string of 255 characters or fewer", 400);
  }
  return title;
}

function normalizeOptionalDescription(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ToolCommandError("description must be a string", 400);
  return value.trim();
}

async function executeProjectSlot(intent: ProjectSlotWriteIntent) {
  let result;
  try {
    result = await new ProjectSlotWriteService().execute(intent);
  } catch (error) {
    throw new ToolCommandError(errorMessage(error), 400);
  }
  if (result.error) throw new ToolCommandError(result.error, mapProjectSlotError(result.error));
  return result;
}

async function projectSlotConfirmation(intent: ProjectSlotWriteIntent, ctx: ToolExecutionContext): Promise<ToolConfirmation | null> {
  if (!shouldConfirm(ctx)) return null;
  const policy = await new AssistantPolicyService().classifyProjectSlotWrite(intent);
  if (!policy.allowed) throw new ToolCommandError(policy.reason, 400);
  if (!policy.requiresApproval) return null;
  return {
    summary: summarizeProjectSlotIntent(intent),
    reason: policy.reason,
    blastRadius: policy.blastRadius,
  };
}

function summarizeProjectSlotIntent(intent: ProjectSlotWriteIntent): string {
  if (intent.operation === "create_project") return `Create project "${intent.input.name}".`;
  if (intent.operation === "update_project") return `Update project #${intent.projectId}: ${Object.keys(intent.input).join(", ") || "no fields"}.`;
  if (intent.operation === "create_slot") return `Create slot "${intent.input.name}" at ${intent.input.rootPath}.`;
  return `Update slot #${intent.slotId}: ${Object.keys(intent.input).join(", ") || "no fields"}.`;
}

async function triggerPhaseConfirmation(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolConfirmation | null> {
  if (!shouldConfirm(ctx)) return null;
  return {
    summary: `Trigger phase ${String(input.phaseName)} for ticket #${String(input.ticketId)}.`,
    reason: "Triggering a phase can change active workflow state and should be confirmed in chat.",
    blastRadius: "high",
  };
}

async function retryPhaseConfirmation(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolConfirmation | null> {
  if (!shouldConfirm(ctx)) return null;
  const ticketId = input.ticketId as number;
  const activePhase = await new PhaseRepository().findActiveByTicketId(ticketId);
  if (!activePhase) throw new ToolCommandError("No active phase to retry", 400);
  const fingerprint = `retry:${ticketId}:${activePhase.id}:${activePhase.status}:${(activePhase.lastMessage ?? "").slice(0, 80)}`;
  const policy = await new AssistantPolicyService().canRetryPhase(activePhase, fingerprint);
  if (policy.allowed) return null;
  return {
    summary: `Retry the active phase for ticket #${ticketId}.`,
    reason: policy.reason,
    blastRadius: "high",
  };
}

export const TOOL_COMMANDS: ToolCommand[] = [
  {
    name: "get_ticket",
    description: "Get a single ticket by ID (includes phase history)",
    exposure: { assistant: true, mcp: true, rest: true },
    input: { id: num("Ticket ID") },
    async handler(input) {
      const ticket = await new TicketRepository().findById(input.id as number);
      if (!ticket) throw new ToolCommandError(`Ticket ${input.id} not found`, 404);
      return ticket;
    },
  },
  {
    name: "list_active_phases",
    description: "List all currently active (non-completed) phases across all tickets",
    exposure: { assistant: true },
    input: {},
    async handler() {
      const phases = await new PhaseRepository().findAll();
      return phases.filter((p) => p.status === PhaseStatus.RUNNING || p.status === PhaseStatus.QUESTION || p.status === PhaseStatus.REQUIRES_ACTION || p.status === PhaseStatus.ERROR);
    },
  },
  {
    name: "get_phase_logs",
    description: "Get the last N lines of phase output logs for a ticket",
    exposure: { assistant: true },
    input: {
      ticketId: num("Ticket ID"),
      lines: num("Number of tail lines (default 100)", { optional: true }),
    },
    async handler(input) {
      const ticket = await new TicketRepository().findById(input.ticketId as number);
      if (!ticket?.uid) throw new ToolCommandError("Ticket not found or no uid", 404);
      const logDir = getTicketDir(ticket.uid);
      const activePhase = await new PhaseRepository().findActiveByTicketId(ticket.id);
      if (!activePhase) throw new ToolCommandError("No active phase found", 404);
      const logFiles = ["planning.md", "implementation.md", "ship.md"];
      const results: Record<string, string> = {};
      const limit = (input.lines as number | undefined) ?? 100;
      for (const fileName of logFiles) {
        const filePath = join(logDir, fileName);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, "utf-8");
          results[fileName] = redactLogText(content.split("\n").slice(-limit).join("\n"));
        }
      }
      const jsonlPath = getLogFile(ticket.uid, String(activePhase.phaseName));
      const jsonlTail = existsSync(jsonlPath)
        ? redactLogText(readFileSync(jsonlPath, "utf-8").slice(-MAX_PHASE_LOG_BYTES).split("\n").slice(-limit).join("\n"))
        : null;
      const pauseContext = activePhase.status === PhaseStatus.QUESTION || activePhase.status === PhaseStatus.REQUIRES_ACTION
        ? await new PauseQuestionContextProvider(new TicketRepository()).getContext(ticket.id, activePhase)
        : null;
      return { phase: activePhase, logs: results, jsonlTail, pauseContext };
    },
  },
  {
    name: "get_app_state",
    description: "Get the current Tribe application state",
    exposure: { assistant: true, rest: true },
    input: {},
    async handler() {
      const state = await new AppStateRepository().get();
      return {
        ...state,
        discordBotToken: null,
        discordBotTokenConfigured: !!state.discordBotToken,
      };
    },
  },
  {
    name: "retry_phase",
    description: "Retry the currently failing phase for a ticket in a fresh CLI session",
    exposure: { assistant: true },
    input: {
      ticketId: num("Ticket ID"),
      reason: str("Why this retry is needed"),
    },
    confirmation: retryPhaseConfirmation,
    async handler(input, ctx) {
      const ticketId = input.ticketId as number;
      const reason = input.reason as string;
      const activePhase = await new PhaseRepository().findActiveByTicketId(ticketId);
      if (!activePhase) throw new ToolCommandError("No active phase to retry", 400);
      if (isAssistantSource(ctx) && !ctx.confirmed) {
        const fingerprint = `retry:${ticketId}:${activePhase.id}:${activePhase.status}:${(activePhase.lastMessage ?? "").slice(0, 80)}`;
        const policy = await new AssistantPolicyService().canRetryPhase(activePhase, fingerprint);
        if (!policy.allowed) throw new ToolCommandError(policy.reason, 400);
      }
      await new PhaseHandler().retry(ticketId, { newCliSession: true, reason });
      return { success: true, message: `Phase retry initiated for ticket #${ticketId}` };
    },
  },
  {
    name: "respond_phase",
    description: "Send a response message to the active phase handler for a ticket.",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      ticketId: num("Ticket ID"),
      message: str("Response message for the active phase"),
    },
    async handler(input) {
      const message = input.message as string;
      if (!message.trim()) throw new ToolCommandError("message is required", 400);
      await new PhaseHandler().respond(input.ticketId as number, message);
      return { success: true };
    },
  },
  {
    name: "trigger_phase",
    description: "Transition a ticket to the given phase and run its phase handler. For unstarted tickets, use publish_ticket instead.",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      ticketId: num("Ticket ID"),
      phaseName: phaseEnum("Phase to trigger"),
    },
    confirmation: triggerPhaseConfirmation,
    async handler(input) {
      return new PhaseHandler().trigger(input.ticketId as number, input.phaseName as TicketPhase);
    },
  },
  {
    name: "post_assistant_message",
    description: "Post a message to the assistant chat visible to the user",
    exposure: { assistant: true },
    input: {
      content: str("Message content"),
      severity: { type: "string", enum: ["info", "warn", "error"], description: "Message severity", optional: true },
      ticketId: num("Ticket ID", { optional: true }),
      embeds: arr("Structured attachments shown below the message", obj("Assistant message embed"), { optional: true }),
    },
    async handler(input, ctx) {
      const msg = await new AssistantMessageRepository().create({
        role: "assistant",
        content: input.content as string,
        severity: (input.severity as "info" | "warn" | "error" | undefined) ?? "info",
        ticketId: (input.ticketId as number | undefined) ?? ctx.ticketId ?? null,
        phaseId: ctx.phaseId ?? null,
        sourceEventKey: ctx.sourceEventKey ?? null,
        embeds: (input.embeds as any[] | undefined) ?? null,
        metadata: { origin: ctx.source === "assistant_auto" ? "system" : "tribe_ui" },
      });
      emit({ type: "assistant.message.created", message: msg });
      return { success: true, messageId: msg.id };
    },
  },
  {
    name: "list_tickets",
    description: "List all tickets, optionally filtered by phase and project",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      phase: phaseEnum("Filter by current phase", { optional: true }),
      projectId: num("Filter by project ID", { optional: true }),
    },
    async handler(input) {
      const opts = input.projectId != null ? { projectId: input.projectId as number } : undefined;
      return input.phase
        ? new TicketRepository().findByPhase(input.phase as TicketPhase, opts)
        : new TicketRepository().findAll(opts);
    },
  },
  {
    name: "create_ticket",
    description: "Create a new ticket. READY tickets enter the workflow; DRAFT saves without triggering.",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      title: str("Short summary of the work"),
      description: str("Detailed description", { optional: true }),
      projectId: num("Project ID to assign, or null for none", { optional: true, nullable: true }),
      cliType: cliEnum("CLI type to use when READY", { optional: true }),
      status: statusEnum("Ticket readiness status", { optional: true }),
      imageUrls: arr("Assistant image embed URLs to copy into the ticket", str("Image URL"), { optional: true }),
    },
    async handler(input, ctx) {
      const status = (input.status as TicketStatus | undefined) ?? TicketStatus.READY;
      const images = ctx.selectImagesForTicket?.(input.imageUrls) ?? [];
      const shouldDeferActivation = isAssistantSource(ctx) && status === TicketStatus.READY && images.length > 0;
      const ticket = await new TicketMutationService().create({
        title: normalizeTicketTitle(input.title),
        description: normalizeOptionalDescription(input.description),
        projectId: (input.projectId as number | null | undefined) ?? null,
        cliType: input.cliType as CliType | undefined,
        status,
        activationContext: activationContextFor(ctx.source, "ticket-create", "mcp-ticket-create"),
        deferActivation: shouldDeferActivation,
      });
      if (!ticket) return null;
      const updatedTicket = images.length > 0 && ctx.attachImagesToTicket
        ? await ctx.attachImagesToTicket(ticket.id, images)
        : ticket;
      if (shouldDeferActivation) {
        new TicketActivationService().activateCreatedIfReady(updatedTicket ?? ticket, "ticket-create");
      }
      return updatedTicket ?? ticket;
    },
  },
  {
    name: "update_ticket",
    description: "Update a ticket's title, description, current phase, or readiness status",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      id: num("Ticket ID"),
      title: str("New title", { optional: true }),
      description: str("New description", { optional: true }),
      currentPhase: phaseEnum("Move ticket to this phase", { optional: true }),
      status: statusEnum("Ticket readiness status", { optional: true }),
      enforceContentEditWindow: bool("Only allow content edits while waiting for a slot", { optional: true }),
      emitAfterUpdate: bool("Emit ticket update events after mutation", { optional: true }),
    },
    async handler(input) {
      return new TicketMutationService().update({
        id: input.id as number,
        title: input.title !== undefined ? normalizeTicketTitle(input.title) : undefined,
        description: normalizeOptionalDescription(input.description),
        currentPhase: input.currentPhase as TicketPhase | undefined,
        status: input.status as TicketStatus | undefined,
        enforceContentEditWindow: input.enforceContentEditWindow as boolean | undefined,
        emitAfterUpdate: input.emitAfterUpdate as boolean | undefined,
      });
    },
  },
  {
    name: "delete_ticket",
    description: "Delete a ticket and all its phase records",
    exposure: { assistant: true, mcp: true, rest: true },
    input: { id: num("Ticket ID") },
    async handler(input) {
      const repo = new TicketRepository();
      const ticket = await repo.findById(input.id as number);
      if (!ticket) throw new ToolCommandError(`Ticket ${input.id} not found`, 404);
      if (ticket.slotId != null) {
        const { SlotService } = await import("../service/SlotService");
        const slot = await new SlotRepository().findById(ticket.slotId);
        if (slot) await new SlotService().releaseAndPromoteQueue(slot);
      }
      await repo.delete(input.id as number);
      return { message: `Ticket ${input.id} deleted successfully` };
    },
  },
  {
    name: "list_phases",
    description: "List all phase records for a ticket",
    exposure: { assistant: true, mcp: true, rest: true },
    input: { ticketId: num("Ticket ID") },
    async handler(input) {
      return new PhaseRepository().findByTicketId(input.ticketId as number);
    },
  },
  {
    name: "get_phase",
    description: "Get a single phase record by ID",
    exposure: { assistant: true, mcp: true, rest: true },
    input: { id: num("Phase ID") },
    async handler(input) {
      const phase = await new PhaseRepository().findById(input.id as number);
      if (!phase) throw new ToolCommandError(`Phase ${input.id} not found`, 404);
      return phase;
    },
  },
  {
    name: "create_phase",
    description: "Create a new phase record for a ticket",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      ticketId: num("Ticket ID"),
      phaseName: phaseEnum("Phase name"),
      startedAt: str("ISO datetime string for when the phase started", { optional: true }),
    },
    async handler(input) {
      return new PhaseRepository().create({
        ticketId: input.ticketId as number,
        phaseName: input.phaseName as TicketPhase,
        startedAt: input.startedAt ? new Date(input.startedAt as string) : undefined,
      });
    },
  },
  {
    name: "update_phase",
    description: "Update a phase record",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      id: num("Phase ID"),
      phaseName: phaseEnum("Change phase name", { optional: true }),
      startedAt: str("ISO datetime for start", { optional: true }),
      completedAt: str("ISO datetime for completion, or null to re-open", { optional: true, nullable: true }),
    },
    async handler(input) {
      const existing = await new PhaseRepository().findById(input.id as number);
      if (!existing) throw new ToolCommandError(`Phase ${input.id} not found`, 404);
      return new PhaseRepository().update(input.id as number, {
        phaseName: input.phaseName as TicketPhase | undefined,
        startedAt: input.startedAt ? new Date(input.startedAt as string) : undefined,
        completedAt: input.completedAt === null ? null : input.completedAt ? new Date(input.completedAt as string) : undefined,
      });
    },
  },
  {
    name: "delete_phase",
    description: "Delete a phase record",
    exposure: { assistant: true, mcp: true, rest: true },
    input: { id: num("Phase ID") },
    async handler(input) {
      const deleted = await new PhaseRepository().delete(input.id as number);
      if (!deleted) throw new ToolCommandError(`Phase ${input.id} not found`, 404);
      return { message: `Phase ${input.id} deleted successfully` };
    },
  },
  {
    name: "publish_ticket",
    description: "Publish a draft ticket so it can enter the workflow",
    exposure: { assistant: true, mcp: true, rest: true },
    input: { ticketId: num("Ticket ID") },
    async handler(input) {
      return new PhaseHandler().publish(input.ticketId as number);
    },
  },
  {
    name: "monday_not_started_tickets",
    description: "Fetch all not-started tickets from Monday.com (groups: Dev Bugs, Prod Bugs Next, Next)",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      projectId: num("Use this project's Monday board settings", { optional: true }),
      boardIds: arr("Override board IDs", num("Board ID"), { optional: true }),
      people: arr("Filter by people names/IDs", str("Person"), { optional: true }),
    },
    async handler(input) {
      let monday: MondayHelper;
      const boardIds = input.boardIds as number[] | undefined;
      const projectId = input.projectId as number | undefined;
      if (projectId != null) {
        const project = await new ProjectRepository().findById(projectId);
        monday = new MondayHelper({
          accessToken: process.env.MONDAY_ACCESS_TOKEN,
          apiUrl: process.env.MONDAY_API_URL,
          defaultBoardIds: boardIds ?? (project?.mondayBoardIds ?? undefined),
          ewebinarDevPeople: project?.mondayDevPeople ?? undefined,
        });
      } else if (boardIds) {
        monday = new MondayHelper({
          accessToken: process.env.MONDAY_ACCESS_TOKEN,
          apiUrl: process.env.MONDAY_API_URL,
          defaultBoardIds: boardIds,
        });
      } else {
        monday = MondayHelper.fromEnv();
      }
      const { items } = await monday.getNotStartedItems({
        boardIds,
        peopleOverride: input.people as string[] | undefined,
      });
      return { count: items.length, items };
    },
  },
  {
    name: "monday_import_ticket",
    description: "Fetch a Monday.com ticket by ID, convert it to markdown, and store/update it in the database",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      mondayItemId: str("Monday item ID or Monday item URL"),
      projectId: num("Project to import the ticket into", { optional: true }),
      cliType: cliEnum("CLI type to use for new READY tickets", { optional: true }),
      status: statusEnum("Ticket readiness status", { optional: true }),
      clues: str("Additional context saved as ticket description", { optional: true }),
      titleOverride: str("Override Monday item title", { optional: true }),
    },
    async handler(input, ctx) {
      return new MondayImportService().importTicket({
        mondayItemId: input.mondayItemId as string,
        projectId: (input.projectId as number | undefined) ?? null,
        cliType: input.cliType as CliType | undefined,
        status: (input.status as TicketStatus | undefined) ?? TicketStatus.READY,
        ...(input.clues ? { clues: input.clues as string } : {}),
        ...(input.titleOverride ? { titleOverride: input.titleOverride as string } : {}),
        activationContext: activationContextFor(ctx.source, "monday-import", "mcp-monday-import"),
      });
    },
  },
  {
    name: "get_projects",
    description: "List all projects with their Monday board settings and activity counts",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {},
    async handler() {
      return new ProjectRepository().findAllWithActivity();
    },
  },
  {
    name: "get_project",
    description: "Get a project by ID with activity counts",
    exposure: { rest: true },
    input: { id: num("Project ID") },
    async handler(input) {
      const project = await new ProjectRepository().findByIdWithActivity(input.id as number);
      if (!project) throw new ToolCommandError(`Project ${input.id} not found`, 404);
      return project;
    },
  },
  {
    name: "create_project",
    description: "Create a project with validated settings",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      name: str("Project name"),
      slug: str("Optional unique project slug", { optional: true, nullable: true }),
      mondayBoardIds: arr("Optional Monday board IDs", num("Board ID"), { optional: true, nullable: true }),
      mondayDefaultPersonId: str("Optional Monday default person ID", { optional: true, nullable: true }),
      mondayDevPeople: arr("Optional Monday people names/IDs", str("Person"), { optional: true, nullable: true }),
      primaryColor: str("Optional #RRGGBB primary color", { optional: true, nullable: true }),
      actionColor: str("Optional #RRGGBB action color", { optional: true, nullable: true }),
      introduction: str("Optional assistant project introduction", { optional: true, nullable: true }),
      rules: str("Optional assistant project rules", { optional: true, nullable: true }),
      techStack: str("Optional assistant project tech stack", { optional: true, nullable: true }),
      fastTrack: bool("Optional fast-track setting", { optional: true }),
    },
    confirmation: (input, ctx) => projectSlotConfirmation({ operation: "create_project", input: input as any }, ctx),
    async handler(input) {
      return executeProjectSlot({ operation: "create_project", input: input as any });
    },
  },
  {
    name: "update_project",
    description: "Update project settings with validated fields",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      projectId: num("Project ID to update"),
      name: str("New project name", { optional: true }),
      slug: str("New unique project slug, or null to clear", { optional: true, nullable: true }),
      mondayBoardIds: arr("Monday board IDs, or null to clear", num("Board ID"), { optional: true, nullable: true }),
      mondayDefaultPersonId: str("Monday default person ID, or null to clear", { optional: true, nullable: true }),
      mondayDevPeople: arr("Monday people names/IDs, or null to clear", str("Person"), { optional: true, nullable: true }),
      primaryColor: str("#RRGGBB primary color, or null to clear", { optional: true, nullable: true }),
      actionColor: str("#RRGGBB action color, or null to clear", { optional: true, nullable: true }),
      introduction: str("Assistant project introduction, or null to clear", { optional: true, nullable: true }),
      rules: str("Assistant project rules, or null to clear", { optional: true, nullable: true }),
      techStack: str("Assistant project tech stack, or null to clear", { optional: true, nullable: true }),
      fastTrack: bool("Fast-track setting", { optional: true }),
    },
    confirmation(input, ctx) {
      const { projectId, ...projectInput } = input;
      return projectSlotConfirmation({ operation: "update_project", projectId: projectId as number, input: projectInput as any }, ctx);
    },
    async handler(input) {
      const { projectId, ...projectInput } = input;
      return executeProjectSlot({ operation: "update_project", projectId: projectId as number, input: projectInput as any });
    },
  },
  {
    name: "delete_project",
    description: "Delete a project if it has no tickets or slots",
    exposure: { rest: true },
    input: { id: num("Project ID") },
    async handler(input) {
      const result = await new ProjectRepository().delete(input.id as number);
      if (!result.ok) throw new ToolCommandError(result.error ?? "Project delete failed", result.error?.includes("not found") ? 404 : 409);
      return { message: `Project ${input.id} deleted successfully` };
    },
  },
  {
    name: "list_slots",
    description: "List all workspace slots with their current ticket assignment and disabled/occupied/free status",
    exposure: { assistant: true, mcp: true, rest: true },
    input: { projectId: num("Filter slots by project ID", { optional: true }) },
    async handler(input) {
      const slots = await new SlotRepository().findAll(input.projectId != null ? { projectId: input.projectId as number } : undefined);
      return slots.map(decorateSlot);
    },
  },
  {
    name: "get_slot",
    description: "Get a workspace slot by ID",
    exposure: { rest: true },
    input: { id: num("Slot ID") },
    async handler(input) {
      const slot = await new SlotRepository().findById(input.id as number);
      if (!slot) throw new ToolCommandError(`Slot ${input.id} not found`, 404);
      return decorateSlot(slot);
    },
  },
  {
    name: "create_slot",
    description: "Create a workspace slot with a validated absolute rootPath and optional project assignment",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      name: str("Slot name"),
      rootPath: str("Absolute workspace root path; this tool does not create directories"),
      projectId: num("Project ID, or null for unassigned", { optional: true, nullable: true }),
    },
    confirmation(input, ctx) {
      return projectSlotConfirmation({
        operation: "create_slot",
        input: input as any,
        defaultProjectId: ctx.activeProjectId ?? null,
      }, ctx);
    },
    async handler(input, ctx) {
      return executeProjectSlot({
        operation: "create_slot",
        input: input as any,
        defaultProjectId: ctx.activeProjectId ?? null,
      });
    },
  },
  {
    name: "update_slot",
    description: "Update workspace slot name, absolute rootPath, project assignment, or disabled state",
    exposure: { assistant: true, mcp: true, rest: true },
    input: {
      slotId: num("Slot ID to update"),
      name: str("New slot name", { optional: true }),
      rootPath: str("New absolute workspace root path", { optional: true }),
      projectId: num("Project ID, or null to unassign", { optional: true, nullable: true }),
      disabled: bool("True blocks new ticket assignment without stopping current work", { optional: true }),
    },
    confirmation(input, ctx) {
      const { slotId, ...slotInput } = input;
      return projectSlotConfirmation({ operation: "update_slot", slotId: slotId as number, input: slotInput as any }, ctx);
    },
    async handler(input) {
      const { slotId, ...slotInput } = input;
      return executeProjectSlot({ operation: "update_slot", slotId: slotId as number, input: slotInput as any });
    },
  },
  {
    name: "delete_slot",
    description: "Delete a free workspace slot",
    exposure: { rest: true },
    input: { id: num("Slot ID") },
    async handler(input) {
      const slot = await new SlotRepository().findById(input.id as number);
      if (!slot) throw new ToolCommandError(`Slot ${input.id} not found`, 404);
      if (slot.currentTicketId !== null) {
        throw new ToolCommandError(`Slot ${input.id} is currently occupied by ticket #${slot.currentTicketId}. Release it first.`, 409);
      }
      await new SlotRepository().delete(input.id as number);
      return { message: `Slot ${input.id} deleted successfully` };
    },
  },
];

export const TOOL_COMMAND_BY_NAME = new Map(TOOL_COMMANDS.map((command) => [command.name, command]));

export function getAssistantToolDefinitions(): Array<{ name: string; description: string; input_schema: AnthropicToolInputSchema }> {
  return TOOL_COMMANDS
    .filter((command) => command.exposure.assistant)
    .map((command) => ({
      name: command.name,
      description: command.description,
      input_schema: buildToolSchema(command.input).anthropic,
    }));
}

export function getMcpToolCommands(): ToolCommand[] {
  return TOOL_COMMANDS.filter((command) => command.exposure.mcp);
}

export function getToolCommand(name: string): ToolCommand | undefined {
  return TOOL_COMMAND_BY_NAME.get(name);
}

export async function executeToolCommand(
  name: string,
  rawInput: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolCommandResult> {
  const command = TOOL_COMMAND_BY_NAME.get(name);
  if (!command) return { ok: false, error: `Unknown tool: ${name}`, statusCode: 404 };

  try {
    const schema = buildToolSchema(command.input);
    const parsed = schemaToParser(schema.zodShape, rawInput);
    const confirmation = await command.confirmation?.(parsed, ctx);
    if (confirmation) {
      return {
        ok: false,
        confirmationRequired: true,
        statusCode: 202,
        pending: {
          name,
          input: parsed,
          confirmation,
          createdAt: new Date().toISOString(),
        },
      };
    }
    const data = await command.handler(parsed, ctx);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: errorMessage(error), statusCode: statusCodeForError(error) };
  }
}

function schemaToParser(zodShape: ReturnType<typeof buildToolSchema>["zodShape"], rawInput: Record<string, unknown>): Record<string, unknown> {
  const { z } = require("zod") as typeof import("zod");
  return z.object(zodShape).passthrough().parse(rawInput);
}

export function isConfirmationResult(result: ToolCommandResult): result is Extract<ToolCommandResult, { confirmationRequired: true }> {
  return !result.ok && "confirmationRequired" in result && result.confirmationRequired === true;
}

export function pendingConfirmationToText(pending: PendingToolConfirmation): string {
  return `${pending.confirmation.summary}\n\n${pending.confirmation.reason}\n\nReply yes to confirm or no to cancel.`;
}

export function resultToAssistantPayload(result: ToolCommandResult): unknown {
  if (result.ok) return result.data;
  if (isConfirmationResult(result)) {
    return {
      confirmationRequired: true,
      summary: result.pending.confirmation.summary,
      reason: result.pending.confirmation.reason,
      blastRadius: result.pending.confirmation.blastRadius,
      message: pendingConfirmationToText(result.pending),
    };
  }
  return { error: result.error };
}

export function resultToMcpText(result: ToolCommandResult): { text: string; isError?: boolean } {
  if (result.ok) return { text: JSON.stringify(result.data, null, 2) };
  if (isConfirmationResult(result)) return { text: JSON.stringify(resultToAssistantPayload(result), null, 2), isError: true };
  return { text: result.error, isError: true };
}
