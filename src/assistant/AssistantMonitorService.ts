import { subscribe } from "../lib/events";
import { AssistantAgentService } from "./AssistantAgentService";
import { PauseQuestionContextProvider, type PauseQuestionContext } from "./PauseQuestionContextProvider";
import { PhaseCompletionSummaryReader, type PhaseCompletionSummary } from "./PhaseCompletionSummary";
import { PhaseStatus } from "../enum/PhaseStatus";
import { TicketRepository } from "../repository/TicketRepository";
import type { Phase } from "../entity/Phase";

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

  constructor(
    agent = new AssistantAgentService(),
    pauseContextProvider = new PauseQuestionContextProvider(),
    summaryReader = new PhaseCompletionSummaryReader(),
    ticketRepo = new TicketRepository(),
  ) {
    this.agent = agent;
    this.pauseContextProvider = pauseContextProvider;
    this.summaryReader = summaryReader;
    this.ticketRepo = ticketRepo;
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
