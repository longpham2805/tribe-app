import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { SlotRepository } from "../repository/SlotRepository";
import { AppStateRepository } from "../repository/AppStateRepository";
import { ProjectRepository } from "../repository/ProjectRepository";
import { AssistantMessageRepository, AssistantActionRepository, AssistantSessionRepository } from "./AssistantRepository";
import { AssistantPolicyService } from "./AssistantPolicyService";
import { PhaseHandler } from "../handler/PhaseHandler";
import { TicketMutationService } from "../service/tickets/TicketMutationService";
import { MondayImportService } from "../service/MondayImportService";
import { MondayHelper } from "../monday/MondayHelper";
import { TicketPhase } from "../enum/TicketPhase";
import { TicketStatus } from "../enum/TicketStatus";
import { CliType } from "../enum/CliType";
import { PhaseStatus } from "../enum/PhaseStatus";
import { emit } from "../lib/events";
import { getLogFile, getTicketDir } from "../lib/paths";
import { PauseQuestionContextProvider } from "./PauseQuestionContextProvider";
import type { Phase } from "../entity/Phase";
import type { Slot } from "../entity/Slot";

const DEFAULT_MODEL = "gpt-5.5";
const MAX_TOOL_ITERATIONS = 10;
const SYSTEM_PROMPT_PATH = join(__dirname, "../docs/agents/assistant.md");
const MAX_PHASE_LOG_BYTES = 256 * 1024;

const log = (msg: string) => console.log(`[AssistantAgent] ${msg}`);

// ── Tool definitions ───────────────────────────────────────────────────

const ASSISTANT_TOOLS: Tool[] = [
  {
    name: "get_ticket",
    description: "Get details of a Tribe ticket by ID",
    input_schema: {
      type: "object",
      properties: { ticketId: { type: "number", description: "Ticket ID" } },
      required: ["ticketId"],
    },
  },
  {
    name: "list_active_phases",
    description: "List all currently active (non-completed) phases across all tickets",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_phase_logs",
    description: "Get the last N lines of phase output logs for a ticket",
    input_schema: {
      type: "object",
      properties: {
        ticketId: { type: "number" },
        lines: { type: "number", description: "Number of tail lines (default 100)" },
      },
      required: ["ticketId"],
    },
  },
  {
    name: "get_workspace_status",
    description: "Get git status and branch info for a ticket's slot workspace",
    input_schema: {
      type: "object",
      properties: { ticketId: { type: "number" } },
      required: ["ticketId"],
    },
  },
  {
    name: "get_app_state",
    description: "Get the current Tribe application state",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "retry_phase",
    description: "Retry the currently failing phase for a ticket (policy-gated)",
    input_schema: {
      type: "object",
      properties: {
        ticketId: { type: "number" },
        reason: { type: "string", description: "Why this retry is needed" },
      },
      required: ["ticketId", "reason"],
    },
  },
  {
    name: "rebase_and_continue",
    description: "Rebase the ticket's workspace branch onto origin/dev and resume the paused phase (policy-gated)",
    input_schema: {
      type: "object",
      properties: {
        ticketId: { type: "number" },
      },
      required: ["ticketId"],
    },
  },
  {
    name: "respond_to_phase",
    description: "Send a message to resume a paused phase (QUESTION/REQUIRES_ACTION/ERROR)",
    input_schema: {
      type: "object",
      properties: {
        ticketId: { type: "number" },
        message: { type: "string" },
      },
      required: ["ticketId", "message"],
    },
  },
  {
    name: "trigger_phase",
    description: "Trigger a specific phase for a ticket (policy-gated). Only use on tickets that are already initialized (have a workspace/uid). For unstarted tickets, use publish_ticket instead — it runs CREATED which initializes the workspace, then auto-starts PLANNING.",
    input_schema: {
      type: "object",
      properties: {
        ticketId: { type: "number" },
        phaseName: {
          type: "string",
          enum: Object.values(TicketPhase),
        },
      },
      required: ["ticketId", "phaseName"],
    },
  },
  {
    name: "post_assistant_message",
    description: "Post a message to the assistant chat visible to the user",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        severity: { type: "string", enum: ["info", "warn", "error"] },
        ticketId: { type: "number" },
      },
      required: ["content"],
    },
  },
  {
    name: "list_tickets",
    description: "List all tickets, optionally filtered by phase and project",
    input_schema: {
      type: "object",
      properties: {
        phase: { type: "string", enum: Object.values(TicketPhase), description: "Filter by current phase" },
        projectId: { type: "number", description: "Filter by project ID" },
      },
    },
  },
  {
    name: "create_ticket",
    description: "Create a new ticket. By default tickets are created as READY and immediately enter the workflow (PLANNING → IMPLEMENTATION → SHIP). Only use DRAFT if the user explicitly asks to save without triggering.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short summary of the work" },
        description: { type: "string", description: "Detailed description" },
        projectId: { type: "number", description: "Project ID to assign" },
        cliType: { type: "string", enum: Object.values(CliType), description: "CLI type to use" },
        status: { type: "string", enum: Object.values(TicketStatus), description: "READY = immediately triggers workflow (default). DRAFT = save without triggering." },
      },
      required: ["title"],
    },
  },
  {
    name: "update_ticket",
    description: "Update a ticket's title, description, or current phase",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Ticket ID" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        currentPhase: { type: "string", enum: Object.values(TicketPhase), description: "Move ticket to this phase" },
        status: { type: "string", enum: Object.values(TicketStatus), description: "Ticket readiness status" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_ticket",
    description: "Delete a ticket and all its phase records",
    input_schema: {
      type: "object",
      properties: { id: { type: "number", description: "Ticket ID" } },
      required: ["id"],
    },
  },
  {
    name: "list_phases",
    description: "List all phase records for a ticket",
    input_schema: {
      type: "object",
      properties: { ticketId: { type: "number", description: "Ticket ID" } },
      required: ["ticketId"],
    },
  },
  {
    name: "get_phase",
    description: "Get a single phase record by ID",
    input_schema: {
      type: "object",
      properties: { id: { type: "number", description: "Phase ID" } },
      required: ["id"],
    },
  },
  {
    name: "create_phase",
    description: "Create a new phase record for a ticket",
    input_schema: {
      type: "object",
      properties: {
        ticketId: { type: "number", description: "Ticket ID" },
        phaseName: { type: "string", enum: Object.values(TicketPhase), description: "Phase name" },
        startedAt: { type: "string", description: "ISO datetime for when the phase started" },
      },
      required: ["ticketId", "phaseName"],
    },
  },
  {
    name: "update_phase",
    description: "Update a phase record (e.g. mark it completed)",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Phase ID" },
        phaseName: { type: "string", enum: Object.values(TicketPhase), description: "Change phase name" },
        startedAt: { type: "string", description: "ISO datetime for start" },
        completedAt: { type: "string", description: "ISO datetime for completion, or null to re-open" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_phase",
    description: "Delete a phase record",
    input_schema: {
      type: "object",
      properties: { id: { type: "number", description: "Phase ID" } },
      required: ["id"],
    },
  },
  {
    name: "publish_ticket",
    description: "Publish a draft ticket so it can enter the workflow",
    input_schema: {
      type: "object",
      properties: { ticketId: { type: "number", description: "Ticket ID" } },
      required: ["ticketId"],
    },
  },
  {
    name: "monday_not_started_tickets",
    description: "Fetch all not-started tickets from Monday.com (groups: Dev Bugs, Prod Bugs Next, Next)",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "number", description: "Use this project's Monday board settings" },
        boardIds: { type: "array", items: { type: "number" }, description: "Override board IDs" },
        people: { type: "array", items: { type: "string" }, description: "Filter by people names/IDs" },
      },
    },
  },
  {
    name: "monday_import_ticket",
    description: "Fetch a Monday.com ticket by ID and import/update it in the database",
    input_schema: {
      type: "object",
      properties: {
        mondayItemId: { type: "string", description: "Monday item ID or URL" },
        projectId: { type: "number", description: "Project to import into" },
        cliType: { type: "string", enum: Object.values(CliType), description: "CLI type for new tickets" },
        status: { type: "string", enum: Object.values(TicketStatus), description: "Ticket readiness status" },
        clues: { type: "string", description: "Additional context saved as ticket description" },
        titleOverride: { type: "string", description: "Override Monday item title" },
      },
      required: ["mondayItemId"],
    },
  },
  {
    name: "get_projects",
    description: "List all projects with their Monday board settings",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_slots",
    description: "List all workspace slots with their current ticket assignment and free/occupied status",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "number", description: "Filter slots by project ID" } },
    },
  },
];

// ── Service ────────────────────────────────────────────────────────────

export class AssistantAgentService {
  private client: Anthropic;
  private ticketRepo: TicketRepository;
  private phaseRepo: PhaseRepository;
  private slotRepo: SlotRepository;
  private appStateRepo: AppStateRepository;
  private projectRepo: ProjectRepository;
  private msgRepo: AssistantMessageRepository;
  private actionRepo: AssistantActionRepository;
  private sessionRepo: AssistantSessionRepository;
  private policy: AssistantPolicyService;
  private pauseContextProvider: PauseQuestionContextProvider;
  private phaseHandler: PhaseHandler;
  private ticketMutationService: TicketMutationService;
  private mondayImportService: MondayImportService;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.ticketRepo = new TicketRepository();
    this.phaseRepo = new PhaseRepository();
    this.slotRepo = new SlotRepository();
    this.appStateRepo = new AppStateRepository();
    this.projectRepo = new ProjectRepository();
    this.msgRepo = new AssistantMessageRepository();
    this.actionRepo = new AssistantActionRepository();
    this.sessionRepo = new AssistantSessionRepository();
    this.policy = new AssistantPolicyService();
    this.pauseContextProvider = new PauseQuestionContextProvider(this.ticketRepo);
    this.phaseHandler = new PhaseHandler();
    this.ticketMutationService = new TicketMutationService();
    this.mondayImportService = new MondayImportService();
  }

  private get systemPrompt(): string {
    if (existsSync(SYSTEM_PROMPT_PATH)) {
      return readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
    }
    return "You are Tribe Assistant, an AI agent that helps monitor and control the Tribe developer workflow system. You can read ticket/phase data and take safe, policy-gated actions.";
  }

  private get model(): string {
    return DEFAULT_MODEL;
  }

  private async resolveDefaultProject(projectId?: number): Promise<{ id: number; name: string } | null> {
    const projects = await this.projectRepo.findAll();
    if (!projects.length) return null;
    if (projectId != null) {
      const found = projects.find((p) => p.id === projectId);
      if (found) return { id: found.id, name: found.name };
    }
    const tribe = projects.find((p) => p.name.toLowerCase() === "tribe");
    if (tribe) return { id: tribe.id, name: tribe.name };
    return { id: projects[0].id, name: projects[0].name };
  }

  private redactLogText(text: string): string {
    return text
      .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
      .replace(/\b(api[_-]?key|token|password|secret|credential|cookie)\b\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  }

  /** Entry point for event-driven auto-actions */
  async handleSystemEvent(opts: {
    description: string;
    ticketId: number;
    phaseId?: number;
    sourceEventKey: string;
    isAutoAction?: boolean;
  }): Promise<void> {
    if (!process.env.ANTHROPIC_API_KEY) {
      log("ANTHROPIC_API_KEY not set — skipping system event handling");
      return;
    }

    const appState = await this.appStateRepo.get();
    if (!appState.assistantAutoActionsEnabled && opts.isAutoAction) {
      log("assistantAutoActionsEnabled=false — skipping auto action");
      return;
    }

    const alreadyHandled = await this.msgRepo.existsBySourceEventKey(opts.sourceEventKey);
    if (alreadyHandled) {
      log(`sourceEventKey already handled: ${opts.sourceEventKey}`);
      return;
    }

    log(`handling system event: ${opts.description}`);

    try {
      const response = await this.runAgentLoop([
        { role: "user", content: opts.description },
      ], { ticketId: opts.ticketId, phaseId: opts.phaseId, sourceEventKey: opts.sourceEventKey });

      // Save assistant's final text response as a message
      if (response) {
        const msg = await this.msgRepo.create({
          role: "assistant",
          content: response,
          ticketId: opts.ticketId,
          phaseId: opts.phaseId,
          severity: "info",
          sourceEventKey: opts.sourceEventKey,
        });
        emit({ type: "assistant.message.created", message: msg });
      }
    } catch (err: any) {
      log(`system event error: ${err?.message ?? err}`);
    }
  }

  /** Entry point for user chat messages */
  async handleUserMessage(opts: {
    message: string;
    projectId?: number;
  }): Promise<string> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return "Assistant is not configured. Please set ANTHROPIC_API_KEY in your environment.";
    }

    // Load recent chat history for context (before saving current message)
    const recentMsgs = await this.msgRepo.findRecent({ limit: 40 });
    const historyMessages: MessageParam[] = recentMsgs
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Resolve active project for context injection
    const activeProject = await this.resolveDefaultProject(opts.projectId);
    const contextNote = activeProject
      ? `[UI CONTEXT] Active project: "${activeProject.name}" (ID: ${activeProject.id}). When the user asks to create a ticket or perform any project-scoped action without specifying a project, use this project by default.`
      : undefined;

    // Save the user's message
    const userMsg = await this.msgRepo.create({
      role: "user",
      content: opts.message,
      ticketId: null,
    });
    emit({ type: "assistant.message.created", message: userMsg });

    const response = await this.runAgentLoop(
      [...historyMessages, { role: "user", content: opts.message }],
      { source: "chat", contextNote },
    );

    const reply = response ?? "I wasn't able to process that request.";

    const assistantMsg = await this.msgRepo.create({
      role: "assistant",
      content: reply,
      ticketId: null,
    });
    emit({ type: "assistant.message.created", message: assistantMsg });

    return reply;
  }

  // ── Agent loop ──────────────────────────────────────────────────────

  private async runAgentLoop(
    initialMessages: MessageParam[],
    ctx: { ticketId?: number; phaseId?: number; sourceEventKey?: string; source?: "auto" | "chat" | "user"; contextNote?: string },
  ): Promise<string | null> {
    const messages: MessageParam[] = [...initialMessages];
    let iterations = 0;
    const system = ctx.contextNote ? `${this.systemPrompt}\n\n${ctx.contextNote}` : this.systemPrompt;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system,
        tools: ASSISTANT_TOOLS,
        messages,
      });

      // Collect any text from this response turn
      const textBlocks = response.content.filter((b) => b.type === "text");
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

      if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
        return textBlocks.map((b) => ("text" in b ? b.text : "")).join("\n").trim() || null;
      }

      // Add assistant turn to history
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool call and collect results
      const toolResults: ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;
        const result = await this.executeTool(block.name, block.input as Record<string, unknown>, ctx);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    log("max iterations reached");
    return null;
  }

  // ── Tool execution ──────────────────────────────────────────────────

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    ctx: { ticketId?: number; phaseId?: number; sourceEventKey?: string; source?: "auto" | "chat" | "user" },
  ): Promise<unknown> {
    const source = ctx.source ?? "auto";

    try {
      switch (name) {
        case "get_ticket": {
          const ticket = await this.ticketRepo.findById(input.ticketId as number);
          if (!ticket) return { error: `Ticket ${input.ticketId} not found` };
          return ticket;
        }

        case "list_active_phases": {
          const phases = await this.phaseRepo.findAll();
          return phases.filter((p) => p.status === PhaseStatus.RUNNING || p.status === PhaseStatus.QUESTION || p.status === PhaseStatus.REQUIRES_ACTION || p.status === PhaseStatus.ERROR);
        }

        case "get_phase_logs": {
          const ticket = await this.ticketRepo.findById(input.ticketId as number);
          if (!ticket?.uid) return { error: "Ticket not found or no uid" };
          const logDir = getTicketDir(ticket.uid);
          const activePhase = await this.phaseRepo.findActiveByTicketId(ticket.id);
          if (!activePhase) return { error: "No active phase found" };
          const logFiles = ["planning.md", "implementation.md", "ship.md"];
          const results: Record<string, string> = {};
          const limit = (input.lines as number) ?? 100;
          for (const f of logFiles) {
            const fp = join(logDir, f);
            if (existsSync(fp)) {
              const content = readFileSync(fp, "utf-8");
              const lines = content.split("\n");
              results[f] = this.redactLogText(lines.slice(-limit).join("\n"));
            }
          }
          const jsonlPath = getLogFile(ticket.uid, String(activePhase.phaseName));
          const jsonlTail = existsSync(jsonlPath)
            ? this.redactLogText(readFileSync(jsonlPath, "utf-8").slice(-MAX_PHASE_LOG_BYTES).split("\n").slice(-limit).join("\n"))
            : null;
          const pauseContext = activePhase.status === PhaseStatus.QUESTION || activePhase.status === PhaseStatus.REQUIRES_ACTION
            ? await this.pauseContextProvider.getContext(ticket.id, activePhase)
            : null;
          return { phase: activePhase, logs: results, jsonlTail, pauseContext };
        }

        case "get_workspace_status": {
          const ticket = await this.ticketRepo.findById(input.ticketId as number);
          if (!ticket?.slotId) return { error: "Ticket has no slot" };
          const slot = await this.slotRepo.findById(ticket.slotId);
          if (!slot?.rootPath) return { error: "Slot has no rootPath" };
          try {
            const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: slot.rootPath, encoding: "utf8" }).trim();
            const status = execSync("git status --short", { cwd: slot.rootPath, encoding: "utf8" }).trim();
            return { branch, status: status || "(clean)", slotRoot: slot.rootPath };
          } catch (e: any) {
            return { error: `git error: ${e.message}` };
          }
        }

        case "get_app_state": {
          return this.appStateRepo.get();
        }

        case "retry_phase": {
          const ticketId = input.ticketId as number;
          const reason = input.reason as string;
          const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
          if (!activePhase) return { error: "No active phase to retry" };

          const fingerprint = `retry:${ticketId}:${activePhase.id}:${activePhase.status}:${(activePhase.lastMessage ?? "").slice(0, 80)}`;
          const policyResult = await this.policy.canRetryPhase(activePhase, fingerprint);

          if (!policyResult.allowed) {
            // Store as proposed action for user review
            const action = await this.actionRepo.create({
              type: "RETRY_PHASE",
              status: "proposed",
              payload: { ticketId, reason },
              reason: policyResult.reason,
              source,
              fingerprint: source === "auto" ? fingerprint : null,
              ticketId,
            });
            emit({ type: "assistant.action.updated", action });
            return { proposed: true, reason: policyResult.reason, actionId: action.id };
          }

          const action = await this.actionRepo.create({
            type: "RETRY_PHASE",
            status: "executed",
            payload: { ticketId, reason },
            reason,
            source,
            fingerprint,
            ticketId,
          });

          try {
            await this.phaseHandler.retry(ticketId, { newCliSession: true, reason });
            emit({ type: "assistant.action.updated", action });
            return { success: true, message: `Phase retry initiated for ticket #${ticketId}` };
          } catch (err: any) {
            await this.actionRepo.updateStatus(action.id, "failed", err.message);
            const updated = await this.actionRepo.findById(action.id);
            if (updated) emit({ type: "assistant.action.updated", action: updated });
            return { error: err.message };
          }
        }

        case "rebase_and_continue": {
          const ticketId = input.ticketId as number;
          const ticket = await this.ticketRepo.findById(ticketId);
          if (!ticket?.slotId) return { error: "Ticket has no slot" };
          const slot = await this.slotRepo.findById(ticket.slotId);
          if (!slot) return { error: "Slot not found" };
          const activePhase = await this.phaseRepo.findActiveByTicketId(ticketId);
          if (!activePhase) return { error: "No active phase" };

          const fingerprint = `rebase:${ticketId}:${slot.id}:${activePhase.id}`;
          const policyResult = await this.policy.canRebaseAndContinue(activePhase, slot, fingerprint);

          if (!policyResult.allowed) {
            const action = await this.actionRepo.create({
              type: "REBASE_AND_CONTINUE",
              status: "proposed",
              payload: { ticketId },
              reason: policyResult.reason,
              source,
              fingerprint: source === "auto" ? fingerprint : null,
              ticketId,
            });
            emit({ type: "assistant.action.updated", action });
            return { proposed: true, reason: policyResult.reason, actionId: action.id };
          }

          const action = await this.actionRepo.create({
            type: "REBASE_AND_CONTINUE",
            status: "executed",
            payload: { ticketId },
            reason: policyResult.reason,
            source,
            fingerprint,
            ticketId,
          });

          try {
            execSync("git rebase origin/dev", { cwd: slot.rootPath!, encoding: "utf8" });
            await this.phaseHandler.respond(ticketId, "Rebased onto origin/dev. Please continue.");
            emit({ type: "assistant.action.updated", action });
            return { success: true, message: `Rebased onto origin/dev and resumed phase for ticket #${ticketId}` };
          } catch (err: any) {
            try { execSync("git rebase --abort", { cwd: slot.rootPath! }); } catch {}
            await this.actionRepo.updateStatus(action.id, "failed", err.message);
            const updated = await this.actionRepo.findById(action.id);
            if (updated) emit({ type: "assistant.action.updated", action: updated });
            return { error: `Rebase failed: ${err.message}. Aborted.` };
          }
        }

        case "respond_to_phase": {
          const ticketId = input.ticketId as number;
          const message = input.message as string;
          try {
            await this.phaseHandler.respond(ticketId, message);
            return { success: true };
          } catch (err: any) {
            return { error: err.message };
          }
        }

        case "trigger_phase": {
          const ticketId = input.ticketId as number;
          const phaseName = input.phaseName as TicketPhase;

          // For non-allowlisted trigger via chat, propose it
          if (source !== "user") {
            const action = await this.actionRepo.create({
              type: "TRIGGER_PHASE",
              status: "proposed",
              payload: { ticketId, phaseName },
              reason: "Phase trigger requires user approval",
              source,
              ticketId,
            });
            emit({ type: "assistant.action.updated", action });
            return { proposed: true, actionId: action.id, message: `Trigger phase ${phaseName} for ticket #${ticketId} is pending your approval.` };
          }

          try {
            await this.phaseHandler.trigger(ticketId, phaseName);
            return { success: true };
          } catch (err: any) {
            return { error: err.message };
          }
        }

        case "post_assistant_message": {
          const msg = await this.msgRepo.create({
            role: "assistant",
            content: input.content as string,
            severity: (input.severity as "info" | "warn" | "error") ?? "info",
            ticketId: (input.ticketId as number) ?? ctx.ticketId ?? null,
            phaseId: ctx.phaseId ?? null,
          });
          emit({ type: "assistant.message.created", message: msg });
          return { success: true, messageId: msg.id };
        }

        case "list_tickets": {
          const projectId = input.projectId as number | undefined;
          const opts = projectId != null ? { projectId } : undefined;
          const tickets = (input.phase as string | undefined)
            ? await this.ticketRepo.findByPhase(input.phase as TicketPhase, opts)
            : await this.ticketRepo.findAll(opts);
          return tickets;
        }

        case "create_ticket": {
          return this.ticketMutationService.create({
            title: input.title as string,
            description: input.description as string | undefined,
            projectId: (input.projectId as number | undefined) ?? null,
            cliType: input.cliType as CliType | undefined,
            status: (input.status as TicketStatus | undefined) ?? TicketStatus.READY,
            activationContext: "mcp-ticket-create",
          });
        }

        case "update_ticket": {
          return this.ticketMutationService.update({
            id: input.id as number,
            title: input.title as string | undefined,
            description: input.description as string | undefined,
            currentPhase: input.currentPhase as TicketPhase | undefined,
            status: input.status as TicketStatus | undefined,
          });
        }

        case "delete_ticket": {
          const deleted = await this.ticketRepo.delete(input.id as number);
          return deleted
            ? { success: true, message: `Ticket ${input.id} deleted` }
            : { error: `Ticket ${input.id} not found` };
        }

        case "list_phases": {
          return this.phaseRepo.findByTicketId(input.ticketId as number);
        }

        case "get_phase": {
          const phase = await this.phaseRepo.findById(input.id as number);
          if (!phase) return { error: `Phase ${input.id} not found` };
          return phase;
        }

        case "create_phase": {
          return this.phaseRepo.create({
            ticketId: input.ticketId as number,
            phaseName: input.phaseName as TicketPhase,
            startedAt: input.startedAt ? new Date(input.startedAt as string) : undefined,
          });
        }

        case "update_phase": {
          const existing = await this.phaseRepo.findById(input.id as number);
          if (!existing) return { error: `Phase ${input.id} not found` };
          return this.phaseRepo.update(input.id as number, {
            phaseName: input.phaseName as TicketPhase | undefined,
            startedAt: input.startedAt ? new Date(input.startedAt as string) : undefined,
            completedAt: input.completedAt === null ? null : input.completedAt ? new Date(input.completedAt as string) : undefined,
          });
        }

        case "delete_phase": {
          const deleted = await this.phaseRepo.delete(input.id as number);
          return deleted
            ? { success: true, message: `Phase ${input.id} deleted` }
            : { error: `Phase ${input.id} not found` };
        }

        case "publish_ticket": {
          return this.phaseHandler.publish(input.ticketId as number);
        }

        case "monday_not_started_tickets": {
          const projectId = input.projectId as number | undefined;
          const boardIds = input.boardIds as number[] | undefined;
          let monday: MondayHelper;
          if (projectId != null) {
            const project = await this.projectRepo.findById(projectId);
            monday = new MondayHelper({
              accessToken: process.env.MONDAY_ACCESS_TOKEN,
              apiUrl: process.env.MONDAY_API_URL,
              defaultBoardIds: boardIds ?? (project?.mondayBoardIds ?? undefined),
              ewebinarDevPeople: project?.mondayDevPeople ?? undefined,
            });
          } else {
            monday = MondayHelper.fromEnv();
          }
          const { items } = await monday.getNotStartedItems({
            boardIds,
            peopleOverride: input.people as string[] | undefined,
          });
          return { count: items.length, items };
        }

        case "monday_import_ticket": {
          return this.mondayImportService.importTicket({
            mondayItemId: input.mondayItemId as string,
            projectId: (input.projectId as number | undefined) ?? null,
            cliType: input.cliType as CliType | undefined,
            status: (input.status as TicketStatus | undefined) ?? TicketStatus.READY,
            ...(input.clues ? { clues: input.clues as string } : {}),
            ...(input.titleOverride ? { titleOverride: input.titleOverride as string } : {}),
            activationContext: "mcp-monday-import",
          });
        }

        case "get_projects": {
          return this.projectRepo.findAll();
        }

        case "list_slots": {
          const projectId = input.projectId as number | undefined;
          const slots = await this.slotRepo.findAll(projectId != null ? { projectId } : undefined);
          return slots.map((slot) => ({
            id: slot.id,
            name: slot.name,
            rootPath: slot.rootPath,
            projectId: slot.projectId,
            status: slot.currentTicketId ? "occupied" : "free",
            currentTicketId: slot.currentTicketId,
          }));
        }

        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err: any) {
      log(`tool ${name} error: ${err?.message ?? err}`);
      return { error: String(err?.message ?? err) };
    }
  }

  /** Execute an approved proposed action */
  async executeApprovedAction(actionId: number): Promise<{ success: boolean; error?: string }> {
    const action = await this.actionRepo.findById(actionId);
    if (!action) return { success: false, error: "Action not found" };
    if (action.status !== "proposed") return { success: false, error: `Action is ${action.status}, not proposed` };

    try {
      const payload = action.payload ?? {};
      const ticketId = payload.ticketId as number | undefined;

      if (action.type === "RETRY_PHASE" && ticketId) {
        await this.phaseHandler.retry(ticketId, { newCliSession: true, reason: action.reason ?? "User approved retry" });
      } else if (action.type === "REBASE_AND_CONTINUE" && ticketId) {
        const ticket = await this.ticketRepo.findById(ticketId);
        const slot = ticket?.slotId ? await this.slotRepo.findById(ticket.slotId) : null;
        if (slot?.rootPath) {
          execSync("git rebase origin/dev", { cwd: slot.rootPath, encoding: "utf8" });
          await this.phaseHandler.respond(ticketId, "Rebased onto origin/dev. Please continue.");
        }
      } else if (action.type === "TRIGGER_PHASE" && ticketId) {
        const phaseName = payload.phaseName as TicketPhase;
        const ticket = await this.ticketRepo.findById(ticketId);
        if (!ticket) throw new Error(`Ticket ${ticketId} not found`);
        if (!ticket.uid || ticket.slotId == null) {
          // Ticket not yet initialized — publish handles slot assignment, uid, and workspace setup
          await this.phaseHandler.publish(ticketId);
        } else {
          await this.phaseHandler.trigger(ticketId, phaseName);
        }
      } else if (action.type === "RESPOND_TO_PHASE" && ticketId) {
        const message = payload.message as string;
        await this.phaseHandler.respond(ticketId, message);
      } else {
        return { success: false, error: `Cannot auto-execute action type ${action.type}` };
      }

      await this.actionRepo.updateStatus(actionId, "executed");
    } catch (err: any) {
      await this.actionRepo.updateStatus(actionId, "failed", err.message);
      const updated = await this.actionRepo.findById(actionId);
      if (updated) emit({ type: "assistant.action.updated", action: updated });
      return { success: false, error: err.message };
    }

    const updated = await this.actionRepo.findById(actionId);
    if (updated) emit({ type: "assistant.action.updated", action: updated });
    return { success: true };
  }
}
