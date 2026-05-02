import { emit, subscribe } from "../lib/events";
import { AssistantAgentService } from "./AssistantAgentService";
import { AssistantMessageRepository } from "./AssistantRepository";
import { PauseQuestionContextProvider, type PauseQuestionContext } from "./PauseQuestionContextProvider";
import { PhaseCompletionSummaryReader, type PhaseCompletionSummary } from "./PhaseCompletionSummary";
import { PhaseStatus } from "../enum/PhaseStatus";
import { TicketRepository } from "../repository/TicketRepository";
import type { Phase } from "../entity/Phase";
import type { AssistantMessageEmbed } from "../shared/assistantEmbed";

const log = (msg: string) => console.log(`[AssistantMonitor] ${msg}`);

const WATCHED_STATUSES: PhaseStatus[] = [
  PhaseStatus.QUESTION,
  PhaseStatus.REQUIRES_ACTION,
  PhaseStatus.ERROR,
  PhaseStatus.COMPLETED,
];

export class AssistantMonitorService {
  private agent: AssistantAgentService;
  private pauseContextProvider: PauseQuestionContextProvider;
  private summaryReader: PhaseCompletionSummaryReader;
  private ticketRepo: TicketRepository;
  private msgRepo: AssistantMessageRepository;

  constructor(
    agent = new AssistantAgentService(),
    pauseContextProvider = new PauseQuestionContextProvider(),
    summaryReader = new PhaseCompletionSummaryReader(),
    ticketRepo = new TicketRepository(),
    msgRepo = new AssistantMessageRepository(),
  ) {
    this.agent = agent;
    this.pauseContextProvider = pauseContextProvider;
    this.summaryReader = summaryReader;
    this.ticketRepo = ticketRepo;
    this.msgRepo = msgRepo;
  }

  start(): void {
    log("started — watching phase events");
    subscribe((event) => {
      if (event.type === "phase.updated") {
        this.onPhaseUpdated(event.ticketId, event.phase as Phase).catch((err) => {
          log(`onPhaseUpdated error: ${err?.message ?? err}`);
        });
      }
    });
  }

  private async onPhaseUpdated(ticketId: number, phase: Phase): Promise<void> {
    if (!WATCHED_STATUSES.includes(phase.status)) return;

    const errorFingerprint = phase.status === PhaseStatus.ERROR
      ? (phase.lastMessage ?? "").slice(0, 80).replace(/\s+/g, "_")
      : "";

    const sourceEventKey = `${ticketId}:${phase.id}:${phase.status}:${errorFingerprint}`;

    const statusLabel = phase.status.toLowerCase().replace("_", " ");
    const pauseContext = phase.status === PhaseStatus.QUESTION || phase.status === PhaseStatus.REQUIRES_ACTION
      ? await this.pauseContextProvider.getContext(ticketId, phase)
      : null;

    if (pauseContext) {
      await this.postPauseMessage(ticketId, phase, pauseContext, sourceEventKey);
      return;
    }

    const completionSummary = phase.status === PhaseStatus.COMPLETED
      ? await this.readCompletionSummary(ticketId, phase)
      : null;
    const description = this.buildEventDescription(ticketId, phase, statusLabel, pauseContext, completionSummary);

    const isAutoAction = phase.status === PhaseStatus.ERROR;

    await this.agent.handleSystemEvent({
      description,
      ticketId,
      phaseId: phase.id,
      sourceEventKey,
      isAutoAction,
    });
  }

  private async postPauseMessage(
    ticketId: number,
    phase: Phase,
    pauseContext: PauseQuestionContext,
    sourceEventKey: string,
  ): Promise<void> {
    if (await this.msgRepo.existsBySourceEventKey(sourceEventKey)) {
      log(`sourceEventKey already handled: ${sourceEventKey}`);
      return;
    }

    const { content, embeds } = this.buildPauseMessage(ticketId, phase, pauseContext);
    const msg = await this.msgRepo.create({
      role: "assistant",
      content,
      ticketId,
      phaseId: phase.id,
      severity: "warn",
      sourceEventKey,
      embeds,
      metadata: { origin: "system" },
    });
    emit({ type: "assistant.message.created", message: msg });
  }

  private buildPauseMessage(ticketId: number, phase: Phase, pauseContext: PauseQuestionContext): {
    content: string;
    embeds: AssistantMessageEmbed[];
  } {
    const canonicalQuestion = this.canonicalPauseQuestion(phase, pauseContext);
    const lines = [
      `Ticket #${ticketId} ${phase.phaseName} is asking:`,
      "",
      this.quoteMarkdown(canonicalQuestion),
    ];

    const details = this.formatPauseMessageDetails(pauseContext, canonicalQuestion);
    if (details) lines.push("", details);

    return {
      content: lines.join("\n"),
      embeds: [{ type: "question", text: canonicalQuestion, ticketId, phaseId: phase.id }],
    };
  }

  private canonicalPauseQuestion(phase: Phase, pauseContext: PauseQuestionContext): string {
    const lastMessage = phase.lastMessage?.trim();
    if (lastMessage) return lastMessage;
    return pauseContext.exactQuestions[0]?.text ?? pauseContext.fallbackContext ?? "Exact pause question text unavailable.";
  }

  private quoteMarkdown(text: string): string {
    return text.split("\n").map((line) => `> ${line}`).join("\n");
  }

  private formatPauseMessageDetails(context: PauseQuestionContext, canonicalQuestion: string): string {
    if (context.exactQuestions.length === 0) return "Options/defaults unavailable. Inspect phase context before deciding.";

    return context.exactQuestions.map((question, index) => {
      const prefix = context.exactQuestions.length > 1 ? `Question ${index + 1}: ` : "";
      return [
        question.text === canonicalQuestion.trim() ? "" : `${prefix}${question.text}`,
        question.options.length > 0 ? `Options: ${question.options.join(" | ")}` : "",
        question.defaultOption ? `Default/recommended: ${question.defaultOption}` : "",
      ].filter(Boolean).join("\n");
    }).filter(Boolean).join("\n\n");
  }

  private async readCompletionSummary(ticketId: number, phase: Phase): Promise<PhaseCompletionSummary | null> {
    try {
      const ticket = await this.ticketRepo.findById(ticketId);
      if (!ticket?.uid) return null;
      return this.summaryReader.read(ticket.uid, phase.phaseName);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log(`completion summary unavailable: ${message}`);
      return null;
    }
  }

  private buildEventDescription(
    ticketId: number,
    phase: Phase,
    statusLabel: string,
    pauseContext: PauseQuestionContext | null,
    completionSummary: PhaseCompletionSummary | null,
  ): string {
    if (phase.status === PhaseStatus.ERROR) {
      return [
        `Ticket #${ticketId} phase ${phase.phaseName} has entered ERROR state.`,
        phase.lastMessage ? `Error: ${phase.lastMessage.slice(0, 500)}` : "",
        "Assess whether this is a transient error that can be safely auto-retried.",
        "If it is transient, call retry_phase. Otherwise, call post_assistant_message to explain what happened and what the user should do.",
      ].filter(Boolean).join("\n");
    }

    if (phase.status === PhaseStatus.QUESTION || phase.status === PhaseStatus.REQUIRES_ACTION) {
      return [
        `Ticket #${ticketId} phase ${phase.phaseName} is paused and ${statusLabel}.`,
        this.formatPauseContext(pauseContext),
        "Call post_assistant_message to relay the exact question text, options/defaults, and required approval context before asking the user to decide.",
      ].filter(Boolean).join("\n");
    }

    if (phase.status === PhaseStatus.COMPLETED) {
      const summaryText = completionSummary ? this.summaryReader.formatForPrompt(completionSummary) : "";
      return [
        `Ticket #${ticketId} phase ${phase.phaseName} completed successfully.`,
        summaryText,
        "Call post_assistant_message with a brief success note using the artifact summary when present. Keep it concise: <=5 bullets, severity 'info'.",
      ].filter(Boolean).join("\n");
    }

    return `Ticket #${ticketId} phase ${phase.phaseName} status changed to ${statusLabel}.`;
  }

  private formatPauseContext(context: PauseQuestionContext | null): string {
    if (!context) return "Exact pause question text unavailable. Inspect phase logs before asking the user to decide.";

    if (context.exactQuestions.length > 0) {
      const questions = context.exactQuestions.map((question, index) => [
        `${index + 1}. ${question.text}`,
        question.options.length > 0 ? `   Options: ${question.options.join(" | ")}` : "",
        question.defaultOption ? `   Default/recommended: ${question.defaultOption}` : "",
        `   Decision mode: ${question.requiresExplicitApproval ? "requires explicit user approval" : "default-resolvable, but relay before proceeding"}`,
        `   Source: ${question.source}`,
      ].filter(Boolean).join("\n"));

      return [
        "Pause questions extracted from phase context:",
        ...questions,
        `Inspect hint: ${context.inspectHint}`,
      ].join("\n");
    }

    return [
      context.fallbackContext ?? "Exact pause question text unavailable.",
      `Inspect hint: ${context.inspectHint}`,
    ].join("\n");
  }
}
