import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { SlotRepository } from "../repository/SlotRepository";
import { AppStateRepository } from "../repository/AppStateRepository";
import { AssistantMessageRepository, AssistantActionRepository, AssistantSessionRepository } from "./AssistantRepository";
import { AssistantPolicyService } from "./AssistantPolicyService";
import { PhaseHandler } from "../handler/PhaseHandler";
import { TicketPhase } from "../enum/TicketPhase";
import { PhaseStatus } from "../enum/PhaseStatus";
import { emit } from "../lib/events";
import { getTicketDir } from "../lib/paths";
import type { Phase } from "../entity/Phase";
import type { Slot } from "../entity/Slot";

const DEFAULT_MODEL = "gpt-5.5";
const MAX_TOOL_ITERATIONS = 10;
const SYSTEM_PROMPT_PATH = join(__dirname, "../docs/agents/assistant.md");

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
    description: "Trigger a specific phase for a ticket (policy-gated for non-current phases)",
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
];

// ── Service ────────────────────────────────────────────────────────────

export class AssistantAgentService {
  private client: Anthropic;
  private ticketRepo: TicketRepository;
  private phaseRepo: PhaseRepository;
  private slotRepo: SlotRepository;
  private appStateRepo: AppStateRepository;
  private msgRepo: AssistantMessageRepository;
  private actionRepo: AssistantActionRepository;
  private sessionRepo: AssistantSessionRepository;
  private policy: AssistantPolicyService;
  private phaseHandler: PhaseHandler;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.ticketRepo = new TicketRepository();
    this.phaseRepo = new PhaseRepository();
    this.slotRepo = new SlotRepository();
    this.appStateRepo = new AppStateRepository();
    this.msgRepo = new AssistantMessageRepository();
    this.actionRepo = new AssistantActionRepository();
    this.sessionRepo = new AssistantSessionRepository();
    this.policy = new AssistantPolicyService();
    this.phaseHandler = new PhaseHandler();
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

    // Save the user's message
    const userMsg = await this.msgRepo.create({
      role: "user",
      content: opts.message,
      ticketId: null,
    });
    emit({ type: "assistant.message.created", message: userMsg });

    const response = await this.runAgentLoop(
      [{ role: "user", content: opts.message }],
      { source: "chat" },
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
    ctx: { ticketId?: number; phaseId?: number; sourceEventKey?: string; source?: "auto" | "chat" | "user" },
  ): Promise<string | null> {
    const messages: MessageParam[] = [...initialMessages];
    let iterations = 0;

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: this.systemPrompt,
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
          for (const f of logFiles) {
            const fp = join(logDir, f);
            if (existsSync(fp)) {
              const content = readFileSync(fp, "utf-8");
              const lines = content.split("\n");
              const limit = (input.lines as number) ?? 100;
              results[f] = lines.slice(-limit).join("\n");
            }
          }
          return { phase: activePhase, logs: results };
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
        await this.phaseHandler.trigger(ticketId, phaseName);
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
