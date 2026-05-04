import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, ImageBlockParam, MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { basename, join } from "path";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { SlotRepository } from "../repository/SlotRepository";
import { AppStateRepository } from "../repository/AppStateRepository";
import { ProjectRepository } from "../repository/ProjectRepository";
import { AssistantMessageRepository, AssistantActionRepository, AssistantSessionRepository } from "./AssistantRepository";
import { AssistantPolicyService } from "./AssistantPolicyService";
import { AssistantProjectSlotWriteService } from "./AssistantProjectSlotWriteService";
import { PhaseHandler } from "../handler/PhaseHandler";
import { TicketMutationService } from "../service/tickets/TicketMutationService";
import { MondayImportService } from "../service/MondayImportService";
import { MondayHelper } from "../monday/MondayHelper";
import { TicketPhase } from "../enum/TicketPhase";
import { TicketStatus } from "../enum/TicketStatus";
import { CliType } from "../enum/CliType";
import { PhaseStatus } from "../enum/PhaseStatus";
import { emit } from "../lib/events";
import { saveTicketImage } from "../lib/fileStorage";
import { getAssistantImagesDir, getLogFile, getTicketDir } from "../lib/paths";
import { PauseQuestionContextProvider } from "./PauseQuestionContextProvider";
import type { AssistantMessage, AssistantMessageMetadata } from "../entity/AssistantMessage";
import type { Ticket } from "../entity/Ticket";
import type { AssistantMessageEmbed } from "../shared/assistantEmbed";
import type { AssistantProjectSlotActionPayload, ProjectCreateInput, ProjectSlotWriteIntent, SlotCreateInput } from "./AssistantProjectSlotContracts";

const DEFAULT_MODEL = "gpt-5.5";
const MAX_TOOL_ITERATIONS = 10;
const SYSTEM_PROMPT_PATH = join(__dirname, "../docs/agents/assistant.md");
const MAX_PHASE_LOG_BYTES = 256 * 1024;
const SUPPORTED_VISION_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const log = (msg: string) => console.log(`[AssistantAgent] ${msg}`);
type ImageEmbed = Extract<AssistantMessageEmbed, { type: "image" }>;
type AssistantToolContext = {
  ticketId?: number;
  phaseId?: number;
  sourceEventKey?: string;
  source?: "auto" | "chat" | "user";
  contextNote?: string;
  imageEmbeds?: ImageEmbed[];
  activeProjectId?: number | null;
};

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
        embeds: {
          type: "array",
          description: "Structured attachments shown below the message. Use to attach plan/implementation summaries, questions, branch names, PRs, or image references.",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["ticket", "plan", "implementation", "branch", "pull_request", "question", "image"] },
              ticketId: { type: "number" },
              phaseId: { type: "number" },
              title: { type: "string" },
              phase: { type: "string" },
              summary: { type: "string" },
              name: { type: "string" },
              url: { type: "string" },
              mimeType: { type: "string" },
              size: { type: "number" },
              number: { type: "number" },
              state: { type: "string" },
              text: { type: "string" },
            },
            required: ["type"],
          },
        },
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
        imageUrls: {
          type: "array",
          items: { type: "string" },
          description: "Assistant image embed URLs from the current user message to copy into the ticket. If omitted, all current-message images are attached.",
        },
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
    name: "create_project",
    description: "Create a project after explaining the intended write to the user. Additive project creation executes directly and returns the created project ID and changed fields.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        slug: { type: "string", description: "Optional unique project slug, or null to clear" },
        mondayBoardIds: { type: "array", items: { type: "number" }, description: "Optional Monday board IDs" },
        mondayDefaultPersonId: { type: "string", description: "Optional Monday default person ID" },
        mondayDevPeople: { type: "array", items: { type: "string" }, description: "Optional Monday people names/IDs" },
        primaryColor: { type: "string", description: "Optional #RRGGBB primary color" },
        actionColor: { type: "string", description: "Optional #RRGGBB action color" },
        introduction: { type: "string", description: "Optional assistant project introduction" },
        rules: { type: "string", description: "Optional assistant project rules" },
        techStack: { type: "string", description: "Optional assistant project tech stack" },
        fastTrack: { type: "boolean", description: "Optional fast-track setting" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_project",
    description: "Update project settings after explaining target fields. Risky updates to running projects are proposed for explicit approval instead of written immediately.",
    input_schema: {
      type: "object",
      properties: {
        projectId: { type: "number", description: "Project ID to update" },
        name: { type: "string", description: "New project name" },
        slug: { type: "string", description: "New unique project slug, or null to clear" },
        mondayBoardIds: { type: "array", items: { type: "number" }, description: "Monday board IDs, or null to clear" },
        mondayDefaultPersonId: { type: "string", description: "Monday default person ID, or null to clear" },
        mondayDevPeople: { type: "array", items: { type: "string" }, description: "Monday people names/IDs, or null to clear" },
        primaryColor: { type: "string", description: "#RRGGBB primary color, or null to clear" },
        actionColor: { type: "string", description: "#RRGGBB action color, or null to clear" },
        introduction: { type: "string", description: "Assistant project introduction, or null to clear" },
        rules: { type: "string", description: "Assistant project rules, or null to clear" },
        techStack: { type: "string", description: "Assistant project tech stack, or null to clear" },
        fastTrack: { type: "boolean", description: "Fast-track setting" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "list_slots",
    description: "List all workspace slots with their current ticket assignment and disabled/occupied/free status",
    input_schema: {
      type: "object",
      properties: { projectId: { type: "number", description: "Filter slots by project ID" } },
    },
  },
  {
    name: "create_slot",
    description: "Create a workspace slot after explaining name, absolute rootPath, and resolved project. Uses the active project by default when projectId is omitted.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Slot name" },
        rootPath: { type: "string", description: "Absolute workspace root path; the assistant does not create directories" },
        projectId: { type: "number", description: "Project ID; defaults to the active UI project when omitted" },
      },
      required: ["name", "rootPath"],
    },
  },
  {
    name: "update_slot",
    description: "Update a workspace slot after explaining target fields. Disabled blocks new ticket work without stopping current work; occupied slot routing updates require explicit approval before write.",
    input_schema: {
      type: "object",
      properties: {
        slotId: { type: "number", description: "Slot ID to update" },
        name: { type: "string", description: "New slot name" },
        rootPath: { type: "string", description: "New absolute workspace root path" },
        projectId: { type: "number", description: "Project ID, or null to unassign" },
        disabled: { type: "boolean", description: "True blocks new ticket assignment without stopping current work" },
      },
      required: ["slotId"],
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
  private projectSlotWriteService: AssistantProjectSlotWriteService;
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
    this.projectSlotWriteService = new AssistantProjectSlotWriteService();
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

      // If the agent already posted a user-visible message for this event via
      // post_assistant_message, treat its final text as an internal acknowledgement.
      const alreadyPostedForEvent = await this.msgRepo.existsBySourceEventKey(opts.sourceEventKey);
      if (response && !alreadyPostedForEvent) {
        const msg = await this.msgRepo.create({
          role: "assistant",
          content: response,
          ticketId: opts.ticketId,
          phaseId: opts.phaseId,
          severity: "info",
          sourceEventKey: opts.sourceEventKey,
          metadata: { origin: "system" },
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

    const response = await this.runAgentLoop(
      [...historyMessages, { role: "user", content: agentUserContent }],
      { source: "chat", contextNote, imageEmbeds, activeProjectId: activeProject?.id ?? null },
    );

    const reply = response ?? "I wasn't able to process that request.";

    const assistantMsg = await this.msgRepo.create({
      role: "assistant",
      content: reply,
      ticketId: null,
      metadata: metadata.origin === "discord" ? metadata : { origin: "tribe_ui" },
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

  // ── Tool execution ──────────────────────────────────────────────────

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    ctx: AssistantToolContext,
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
            sourceEventKey: ctx.sourceEventKey ?? null,
            embeds: (input.embeds as any[]) ?? null,
            metadata: { origin: source === "auto" ? "system" : "tribe_ui" },
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
          const requestedStatus = (input.status as TicketStatus | undefined) ?? TicketStatus.READY;
          const images = this.selectImagesForTicket(ctx.imageEmbeds ?? [], input.imageUrls);
          const shouldDeferActivation = requestedStatus === TicketStatus.READY && images.length > 0;
          const ticket = await this.ticketMutationService.create({
            title: input.title as string,
            description: input.description as string | undefined,
            projectId: (input.projectId as number | undefined) ?? null,
            cliType: input.cliType as CliType | undefined,
            status: requestedStatus,
            activationContext: "mcp-ticket-create",
            deferActivation: shouldDeferActivation,
          });
          if (!ticket) return null;

          const updatedTicket = images.length > 0
            ? await this.attachImagesToTicket(ticket.id, images)
            : ticket;

          if (shouldDeferActivation) {
            this.phaseHandler.initCreated(updatedTicket ?? ticket).catch((err: unknown) => {
              const message = err instanceof Error ? err.message : String(err);
              log(`initCreated error after image attach for ticket #${ticket.id}: ${message}`);
            });
          }

          return updatedTicket ?? ticket;
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
          const ticketId = input.id as number;
          const deleted = await this.ticketRepo.delete(ticketId);
          return deleted
            ? { success: true, message: `Ticket ${ticketId} deleted` }
            : { error: `Ticket ${ticketId} not found` };
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

        case "create_project": {
          return this.handleProjectSlotWrite({ operation: "create_project", input: input as ProjectCreateInput }, source);
        }

        case "update_project": {
          const { projectId, ...projectInput } = input;
          return this.handleProjectSlotWrite({ operation: "update_project", projectId: projectId as number, input: projectInput }, source);
        }

        case "list_slots": {
          const projectId = input.projectId as number | undefined;
          const slots = await this.slotRepo.findAll(projectId != null ? { projectId } : undefined);
          return slots.map((slot) => ({
            id: slot.id,
            name: slot.name,
            rootPath: slot.rootPath,
            projectId: slot.projectId,
            disabled: slot.disabled,
            status: slot.disabled ? "disabled" : slot.currentTicketId ? "occupied" : "free",
            currentTicketId: slot.currentTicketId,
          }));
        }

        case "create_slot": {
          return this.handleProjectSlotWrite({ operation: "create_slot", input: input as SlotCreateInput, defaultProjectId: ctx.activeProjectId ?? null }, source);
        }

        case "update_slot": {
          const { slotId, ...slotInput } = input;
          return this.handleProjectSlotWrite({ operation: "update_slot", slotId: slotId as number, input: slotInput }, source);
        }

        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err: any) {
      log(`tool ${name} error: ${err?.message ?? err}`);
      return { error: String(err?.message ?? err) };
    }
  }

  private async handleProjectSlotWrite(intent: ProjectSlotWriteIntent, source: "auto" | "chat" | "user"): Promise<unknown> {
    const policy = await this.policy.classifyProjectSlotWrite(intent);
    if (!policy.allowed) {
      return { operation: intent.operation, error: policy.reason, approvalRequired: false };
    }

    if (policy.requiresApproval) {
      const payload: AssistantProjectSlotActionPayload = { kind: "project_slot_write", intent };
      const action = await this.actionRepo.create({
        type: "OTHER",
        status: "proposed",
        payload,
        reason: policy.reason,
        source,
        confidence: 0.82,
      });
      emit({ type: "assistant.action.updated", action });
      return {
        proposed: true,
        approvalRequired: true,
        actionId: action.id,
        operation: intent.operation,
        reason: policy.reason,
        blastRadius: policy.blastRadius,
        message: `${intent.operation} requires approval before Tribe writes project or slot settings.`,
      };
    }

    const result = await this.projectSlotWriteService.execute(intent);
    return {
      ...result,
      approvalRequired: false,
      reason: policy.reason,
      blastRadius: policy.blastRadius,
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
