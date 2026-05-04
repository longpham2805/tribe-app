export type EventTimestamp = string | Date;

export type TicketPhaseName = "CREATED" | "PLANNING" | "IMPLEMENTATION" | "SHIP" | "FEEDBACK";
export type PhaseStatusName = "PENDING" | "RUNNING" | "COMPLETED" | "REQUIRES_ACTION" | "QUESTION" | "ERROR";
export type TicketStatusName = "DRAFT" | "READY";
export type CliTypeName = "CLAUDE" | "CODEX";
export type MessageRoleName = "user" | "assistant" | "system";
export type MessageSeverityName = "info" | "warn" | "error";
export type AssistantActionTypeName = "RETRY_PHASE" | "RESPOND_TO_PHASE" | "TRIGGER_PHASE" | "OTHER";
export type AssistantActionStatusName = "proposed" | "approved" | "rejected" | "executed" | "failed";
export type AssistantActionSourceName = "auto" | "chat" | "user";

export type PullRequestEventPayload = { repo: string; prUrl: string; commitSha: string };

export type PhaseEventPayload<TTimestamp extends EventTimestamp = string> = {
  id: number;
  ticketId: number;
  phaseName: TicketPhaseName;
  sequence: number;
  feedbackComment: string | null;
  branchName: string | null;
  pullRequests: PullRequestEventPayload[] | null;
  startedAt: TTimestamp | null;
  completedAt: TTimestamp | null;
  status: PhaseStatusName;
  lastMessage: string | null;
  cliSessionId?: string | null;
  createdAt?: TTimestamp;
  updatedAt?: TTimestamp;
};

export type TicketEventPayload<TTimestamp extends EventTimestamp = string> = {
  id: number;
  title: string;
  description: string | null;
  status: TicketStatusName;
  currentPhase: TicketPhaseName;
  cliType: CliTypeName;
  mondayItemId: string | null;
  mondayBoardId?: number | null;
  branchName: string | null;
  pullRequests: PullRequestEventPayload[] | null;
  slotId: number | null;
  waitingForSlot: boolean;
  isDone: boolean;
  projectId: number | null;
  createdAt: TTimestamp;
  updatedAt: TTimestamp;
  phases: PhaseEventPayload<TTimestamp>[];
};

export type AppStateEventPayload<TTimestamp extends EventTimestamp = string> = {
  id: number;
  autoTriggerEnabled: boolean;
  availableCliTypes: CliTypeName[];
  assistantAutoActionsEnabled?: boolean;
  assistantModel?: string | null;
  discordBotToken: null;
  discordBotTokenConfigured: boolean;
  discordAssistantThreadId: string | null;
  createdAt: TTimestamp;
  updatedAt: TTimestamp;
};

export type AssistantMessageEmbedEventPayload =
  | { type: "ticket"; ticketId: number; title?: string; phase?: string }
  | { type: "plan"; ticketId: number; phaseId?: number; summary: string }
  | { type: "implementation"; ticketId: number; phaseId?: number; summary: string }
  | { type: "branch"; name: string; ticketId?: number }
  | { type: "pull_request"; url: string; number?: number; title?: string; state?: string; ticketId?: number }
  | { type: "question"; text: string; ticketId?: number; phaseId?: number }
  | { type: "image"; url: string; name?: string; mimeType?: string; size?: number; source?: "tribe_ui" | "discord" };

export type AssistantMessageEventPayload<TTimestamp extends EventTimestamp = string> = {
  id: number;
  role: MessageRoleName;
  content: string;
  ticketId: number | null;
  phaseId: number | null;
  severity: MessageSeverityName;
  readAt: TTimestamp | null;
  sourceEventKey: string | null;
  metadata: Record<string, unknown> | null;
  embeds: AssistantMessageEmbedEventPayload[] | null;
  createdAt: TTimestamp;
  updatedAt: TTimestamp;
};

export type AssistantActionEventPayload<TTimestamp extends EventTimestamp = string> = {
  id: number;
  type: AssistantActionTypeName;
  status: AssistantActionStatusName;
  payload: Record<string, unknown> | null;
  reason: string | null;
  confidence: number | null;
  source: AssistantActionSourceName;
  fingerprint: string | null;
  ticketId: number | null;
  messageId: number | null;
  errorMessage: string | null;
  createdAt: TTimestamp;
  updatedAt: TTimestamp;
};

export type PhaseSystemEventMetadata = Record<string, string | number | boolean | null>;

export type PhaseSystemEvent = {
  type: "system";
  source: "PhaseHandler";
  code: string;
  message: string;
  at: string;
  ticketId: number;
  phaseName: TicketPhaseName;
  detail?: PhaseSystemEventMetadata;
};

export type TribeRunStartEvent = {
  type: "_tribe.run_start";
  at: string;
  resumeSessionId: string | null;
};

export type TribePromptEvent = {
  type: "_tribe.prompt";
  at: string;
  resumeSessionId: string;
  text: string;
};

export type RawPhaseTextEvent = {
  type: "raw";
  text: string;
};

export type ExternalPhaseLogEvent = Record<string, unknown>;

export type PhaseLogEvent = PhaseSystemEvent | TribeRunStartEvent | TribePromptEvent | RawPhaseTextEvent | ExternalPhaseLogEvent;

export type TribeEvent<TTimestamp extends EventTimestamp = EventTimestamp> =
  | { type: "phase.updated"; ticketId: number; phase: PhaseEventPayload<TTimestamp> }
  | { type: "phase.log"; ticketId: number; phaseName: TicketPhaseName; event: PhaseLogEvent }
  | { type: "ticket.updated"; ticket: TicketEventPayload<TTimestamp> }
  | { type: "ticket.deleted"; ticketId: number }
  | { type: "app-state.updated"; appState: AppStateEventPayload<TTimestamp> }
  | { type: "assistant.message.created"; message: AssistantMessageEventPayload<TTimestamp> }
  | { type: "assistant.action.updated"; action: AssistantActionEventPayload<TTimestamp> };

export type WebSocketMessage<TTimestamp extends EventTimestamp = string> = { type: "hello" } | TribeEvent<TTimestamp>;
