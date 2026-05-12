import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, ImageBlockParam, MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { basename, join } from "path";
import { TicketRepository } from "../repository/TicketRepository";
import { ProjectRepository } from "../repository/ProjectRepository";
import { AppStateRepository } from "../repository/AppStateRepository";
import { AssistantMessageRepository, AssistantActionRepository, AssistantSessionRepository } from "./AssistantRepository";
import { PhaseHandler } from "../handler/PhaseHandler";
import { TicketPhase } from "../enum/TicketPhase";
import { emit } from "../lib/events";
import { saveTicketImage } from "../lib/fileStorage";
import { getAssistantImagesDir } from "../lib/paths";
import type { AssistantMessage, AssistantMessageMetadata } from "../entity/AssistantMessage";
import type { Ticket } from "../entity/Ticket";
import type { AssistantMessageEmbed } from "../shared/assistantEmbed";
import { ProjectSlotWriteService } from "../tools/ProjectSlotWriteService";
import {
  executeToolCommand,
  getAssistantToolDefinitions,
  isConfirmationResult,
  pendingConfirmationToText,
  resultToAssistantPayload,
} from "../tools/commands";
import type { PendingToolConfirmation, ToolCommandResult, ToolExecutionContext } from "../tools/types";
import type { AssistantProjectSlotActionPayload, ProjectSlotWriteIntent } from "../tools/projectSlotContracts";

const DEFAULT_MODEL = "gpt-5.5";
const MAX_TOOL_ITERATIONS = 10;
const SYSTEM_PROMPT_PATH = join(__dirname, "../docs/agents/assistant.md");
const SUPPORTED_VISION_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const log = (msg: string) => console.log(`[AssistantAgent] ${msg}`);
type ImageEmbed = Extract<AssistantMessageEmbed, { type: "image" }>;
type AssistantToolContext = {
  ticketId?: number;
  phaseId?: number;
  sourceEventKey?: string;
  source?: "assistant_auto" | "assistant_chat";
  contextNote?: string;
  imageEmbeds?: ImageEmbed[];
  activeProjectId?: number | null;
};
type AgentLoopResult = {
  text: string | null;
  pendingConfirmation?: PendingToolConfirmation;
};

// ── Tool definitions ───────────────────────────────────────────────────

const ASSISTANT_TOOLS = getAssistantToolDefinitions() as Tool[];

// ── Service ────────────────────────────────────────────────────────────

export class AssistantAgentService {
  private client: Anthropic;
  private ticketRepo: TicketRepository;
  private appStateRepo: AppStateRepository;
  private projectRepo: ProjectRepository;
  private msgRepo: AssistantMessageRepository;
  private actionRepo: AssistantActionRepository;
  private sessionRepo: AssistantSessionRepository;
  private projectSlotWriteService: ProjectSlotWriteService;
  private phaseHandler: PhaseHandler;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.ticketRepo = new TicketRepository();
    this.appStateRepo = new AppStateRepository();
    this.projectRepo = new ProjectRepository();
    this.msgRepo = new AssistantMessageRepository();
    this.actionRepo = new AssistantActionRepository();
    this.sessionRepo = new AssistantSessionRepository();
    this.projectSlotWriteService = new ProjectSlotWriteService();
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
      ], { ticketId: opts.ticketId, phaseId: opts.phaseId, sourceEventKey: opts.sourceEventKey, source: "assistant_auto" });

      // If the agent already posted a user-visible message for this event via
      // post_assistant_message, treat its final text as an internal acknowledgement.
      const alreadyPostedForEvent = await this.msgRepo.existsBySourceEventKey(opts.sourceEventKey);
      if (response.text && !alreadyPostedForEvent) {
        const msg = await this.msgRepo.create({
          role: "assistant",
          content: response.text,
          ticketId: opts.ticketId,
          phaseId: opts.phaseId,
          severity: "info",
          sourceEventKey: opts.sourceEventKey,
          metadata: {
            origin: "system",
            ...(response.pendingConfirmation ? { pendingToolConfirmation: response.pendingConfirmation } : {}),
          },
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
    metadata?: AssistantMessageMetadata | null;
    embeds?: AssistantMessageEmbed[] | null;
    onUserMessageCreated?: (message: AssistantMessage) => void | Promise<void>;
  }): Promise<string> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return "Assistant is not configured. Please set ANTHROPIC_API_KEY in your environment.";
    }

    // Load recent chat history for context (before saving current message)
    const recentMsgs = await this.msgRepo.findRecent({ limit: 40 });
    const pendingConfirmation = this.getLatestPendingConfirmation(recentMsgs);
    const historyMessages: MessageParam[] = recentMsgs
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.role === "user"
          ? this.formatUserMessageForAgent(
            m.content,
            this.normalizeUserMessageMetadata(m.metadata),
            this.getImageEmbeds(m.embeds),
          )
          : m.content,
      }));

    // Resolve active project for context injection
    const activeProject = await this.resolveDefaultProject(opts.projectId);
    const contextNote = activeProject
      ? `[UI CONTEXT] Active project: "${activeProject.name}" (ID: ${activeProject.id}). When the user asks to create a ticket or perform any project-scoped action without specifying a project, use this project by default.`
      : undefined;
    const metadata = this.normalizeUserMessageMetadata(opts.metadata);
    const imageEmbeds = this.getImageEmbeds(opts.embeds);
    const agentUserText = this.formatUserMessageForAgent(opts.message, metadata, imageEmbeds);
    const agentUserContent = this.buildAgentUserContent(agentUserText, imageEmbeds);

    // Save the user's message
    const userMsg = await this.msgRepo.create({
      role: "user",
      content: opts.message,
      ticketId: null,
      metadata,
      embeds: opts.embeds ?? null,
    });
    await opts.onUserMessageCreated?.(userMsg);
    emit({ type: "assistant.message.created", message: userMsg });

    let reply: string;
    let nextPendingConfirmation: PendingToolConfirmation | undefined;
    if (pendingConfirmation) {
      reply = await this.handlePendingConfirmationReply(opts.message, pendingConfirmation, {
        source: "assistant_chat",
        contextNote,
        imageEmbeds,
        activeProjectId: activeProject?.id ?? null,
      });
    } else {
      const response = await this.runAgentLoop(
        [...historyMessages, { role: "user", content: agentUserContent }],
        { source: "assistant_chat", contextNote, imageEmbeds, activeProjectId: activeProject?.id ?? null },
      );
      reply = response.text ?? "I wasn't able to process that request.";
      nextPendingConfirmation = response.pendingConfirmation;
    }

    const assistantMetadata: AssistantMessageMetadata = metadata.origin === "discord"
      ? { ...metadata }
      : { origin: "tribe_ui" };
    if (nextPendingConfirmation) {
      assistantMetadata.pendingToolConfirmation = nextPendingConfirmation;
    }

    const assistantMsg = await this.msgRepo.create({
      role: "assistant",
      content: reply,
      ticketId: null,
      metadata: assistantMetadata,
    });
    emit({ type: "assistant.message.created", message: assistantMsg });

    return reply;
  }

  private normalizeUserMessageMetadata(metadata?: AssistantMessageMetadata | null): AssistantMessageMetadata {
    const origin = metadata?.origin ?? "tribe_ui";
    return {
      ...(metadata ?? {}),
      origin: origin === "discord" || origin === "system" ? origin : "tribe_ui",
    };
  }

  private getLatestPendingConfirmation(messages: AssistantMessage[]): PendingToolConfirmation | undefined {
    const latest = messages[0];
    if (!latest || latest.role !== "assistant") return undefined;
    const pending = latest.metadata?.pendingToolConfirmation;
    if (!pending || typeof pending !== "object") return undefined;
    const candidate = pending as Partial<PendingToolConfirmation>;
    if (
      typeof candidate.name !== "string" ||
      !candidate.input ||
      typeof candidate.input !== "object" ||
      !candidate.confirmation ||
      typeof candidate.confirmation !== "object"
    ) {
      return undefined;
    }
    return candidate as PendingToolConfirmation;
  }

  private async handlePendingConfirmationReply(
    message: string,
    pending: PendingToolConfirmation,
    ctx: AssistantToolContext,
  ): Promise<string> {
    if (!this.isAffirmativeReply(message)) {
      return "Okay, I will not run that.";
    }

    const result = await executeToolCommand(pending.name, pending.input, {
      ...this.buildToolExecutionContext(ctx),
      confirmed: true,
    });
    if (result.ok) {
      return this.formatConfirmedToolResult(pending, result);
    }
    if (isConfirmationResult(result)) {
      return pendingConfirmationToText(result.pending);
    }
    return `I tried to run it, but it failed: ${result.error}`;
  }

  private isAffirmativeReply(message: string): boolean {
    return /^(yes|y|yeah|yep|confirm|confirmed|approve|approved|go ahead|do it|please do|sure|ok|okay)\b/i.test(message.trim());
  }

  private formatConfirmedToolResult(pending: PendingToolConfirmation, result: ToolCommandResult): string {
    if (!result.ok) return "I could not complete that command.";
    const data = result.data as { message?: unknown; success?: unknown; operation?: unknown } | null;
    if (data && typeof data.message === "string") return data.message;
    if (data && data.success === true && typeof data.operation === "string") {
      return `Done. ${String(data.operation)} completed.`;
    }
    return `Done. ${pending.confirmation.summary}`;
  }

  private getImageEmbeds(embeds?: AssistantMessageEmbed[] | null): ImageEmbed[] {
    return (embeds ?? []).filter((embed): embed is ImageEmbed => embed.type === "image");
  }

  private formatUserMessageForAgent(message: string, metadata: AssistantMessageMetadata, imageEmbeds: ImageEmbed[] = []): string {
    const imageNote = imageEmbeds.length > 0
      ? `\n\n[Attached images]\n${imageEmbeds.map((image, index) => `${index + 1}. ${image.name ?? "image"} (${image.url})`).join("\n")}`
      : "";
    const content = `${message}${imageNote}`;
    if (metadata.origin !== "discord") return content;
    const discord = metadata.discord;
    const author = discord?.authorDisplayName ?? discord?.authorUsername ?? discord?.authorId ?? "Discord user";
    return `[Discord message from ${author}]\n\n${content}`;
  }

  private buildAgentUserContent(message: string, imageEmbeds: ImageEmbed[]): MessageParam["content"] {
    const blocks: ContentBlockParam[] = [{ type: "text", text: message }];

    for (const image of imageEmbeds) {
      const imageBlock = this.buildImageBlock(image);
      if (imageBlock) blocks.push(imageBlock);
    }

    return blocks.length === 1 ? message : blocks;
  }

  private buildImageBlock(image: ImageEmbed): ImageBlockParam | null {
    const mediaType = image.mimeType;
    if (!mediaType || !SUPPORTED_VISION_MEDIA_TYPES.has(mediaType)) return null;
    const filePath = this.resolveAssistantImagePath(image.url);
    if (!filePath || !existsSync(filePath)) return null;

    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: readFileSync(filePath).toString("base64"),
      },
    };
  }

  private resolveAssistantImagePath(url: string): string | null {
    const match = url.match(/^\/api\/uploads\/assistant\/images\/([^/?#]+)$/);
    if (!match) return null;
    const imageName = decodeURIComponent(match[1]);
    if (imageName !== basename(imageName)) return null;
    return join(getAssistantImagesDir(), imageName);
  }

  // ── Agent loop ──────────────────────────────────────────────────────

  private async runAgentLoop(
    initialMessages: MessageParam[],
    ctx: AssistantToolContext,
  ): Promise<AgentLoopResult> {
    const messages: MessageParam[] = [...initialMessages];
    let iterations = 0;
    let pendingConfirmation: PendingToolConfirmation | undefined;
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
        return {
          text: textBlocks.map((b) => ("text" in b ? b.text : "")).join("\n").trim() || null,
          pendingConfirmation,
        };
      }

      // Add assistant turn to history
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool call and collect results
      const toolResults: ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;
        const result = await executeToolCommand(
          block.name,
          block.input as Record<string, unknown>,
          this.buildToolExecutionContext(ctx),
        );
        if (isConfirmationResult(result)) {
          pendingConfirmation = result.pending;
        }
        const payload = resultToAssistantPayload(result);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: typeof payload === "string" ? payload : JSON.stringify(payload),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    log("max iterations reached");
    return { text: null, pendingConfirmation };
  }

  private selectImagesForTicket(imageEmbeds: ImageEmbed[], value: unknown): ImageEmbed[] {
    if (!Array.isArray(value)) return imageEmbeds;

    const urls = new Set(value.filter((url): url is string => typeof url === "string"));
    if (urls.size === 0) return [];
    const currentImages = imageEmbeds.filter((image) => urls.has(image.url));
    const currentUrls = new Set(currentImages.map((image) => image.url));
    const referencedImages = Array.from(urls)
      .filter((url) => !currentUrls.has(url) && this.resolveAssistantImagePath(url))
      .map((url): ImageEmbed => ({ type: "image", url, name: basename(url), source: "tribe_ui" }));
    return [...currentImages, ...referencedImages];
  }

  private async attachImagesToTicket(ticketId: number, imageEmbeds: ImageEmbed[]): Promise<Ticket | null> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) return null;

    let uid = ticket.uid;
    if (!uid) {
      uid = randomUUID();
      await this.ticketRepo.update(ticketId, { uid });
    }

    const refs: string[] = [];
    for (const image of imageEmbeds) {
      const sourcePath = this.resolveAssistantImagePath(image.url);
      if (!sourcePath || !existsSync(sourcePath)) continue;

      const buffer = readFileSync(sourcePath);
      const originalName = image.name ?? basename(sourcePath);
      const imagePath = await saveTicketImage(uid, buffer, originalName);
      const imageName = basename(imagePath);
      const imageUrl = `/api/uploads/tickets/${ticketId}/images/${encodeURIComponent(imageName)}`;
      refs.push(`![${originalName}](${imageUrl})`);
    }

    if (refs.length === 0) {
      return this.ticketRepo.findById(ticketId);
    }

    const nextDescription = `${ticket.description ?? ""}${ticket.description ? "\n\n" : ""}${refs.join("\n\n")}`;
    await this.ticketRepo.update(ticketId, { description: nextDescription });
    return this.ticketRepo.findById(ticketId);
  }

  private buildToolExecutionContext(ctx: AssistantToolContext): ToolExecutionContext {
    return {
      source: ctx.source ?? "assistant_auto",
      activeProjectId: ctx.activeProjectId ?? null,
      ticketId: ctx.ticketId,
      phaseId: ctx.phaseId,
      sourceEventKey: ctx.sourceEventKey,
      imageEmbeds: ctx.imageEmbeds,
      selectImagesForTicket: (value: unknown) => this.selectImagesForTicket(ctx.imageEmbeds ?? [], value),
      attachImagesToTicket: (ticketId: number, images: ImageEmbed[]) => this.attachImagesToTicket(ticketId, images),
    };
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
      } else if (action.type === "OTHER" && this.isProjectSlotActionPayload(payload)) {
        const result = await this.projectSlotWriteService.execute(payload.intent);
        if (result.error) throw new Error(result.error);
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

  private isProjectSlotActionPayload(payload: Record<string, unknown>): payload is AssistantProjectSlotActionPayload {
    if (payload.kind !== "project_slot_write") return false;
    const intent = payload.intent as ProjectSlotWriteIntent | undefined;
    if (!intent || typeof intent !== "object") return false;
    if (intent.operation === "create_project") return typeof intent.input === "object" && intent.input !== null;
    if (intent.operation === "update_project") return Number.isInteger(intent.projectId) && typeof intent.input === "object" && intent.input !== null;
    if (intent.operation === "create_slot") return typeof intent.input === "object" && intent.input !== null;
    if (intent.operation === "update_slot") return Number.isInteger(intent.slotId) && typeof intent.input === "object" && intent.input !== null;
    return false;
  }
}
