export type MessageRole = "user" | "assistant" | "system";
export type MessageSeverity = "info" | "warn" | "error";
export type ActionType =
  | "RETRY_PHASE"
  | "RESPOND_TO_PHASE"
  | "TRIGGER_PHASE"
  | "OTHER";
export type ActionStatus = "proposed" | "approved" | "rejected" | "executed" | "failed";
export type ActionSource = "auto" | "chat" | "user";

export type AssistantMessageEmbed =
  | { type: "ticket"; ticketId: number; title?: string; phase?: string }
  | { type: "plan"; ticketId: number; phaseId?: number; summary: string }
  | { type: "implementation"; ticketId: number; phaseId?: number; summary: string }
  | { type: "branch"; name: string; ticketId?: number }
  | { type: "pull_request"; url: string; number?: number; title?: string; state?: string; ticketId?: number }
  | { type: "question"; text: string; ticketId?: number; phaseId?: number };

export interface AssistantMessage {
  id: number;
  role: MessageRole;
  content: string;
  ticketId: number | null;
  phaseId: number | null;
  severity: MessageSeverity;
  readAt: string | null;
  sourceEventKey: string | null;
  metadata: Record<string, unknown> | null;
  embeds: AssistantMessageEmbed[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantAction {
  id: number;
  type: ActionType;
  status: ActionStatus;
  payload: Record<string, unknown> | null;
  reason: string | null;
  confidence: number | null;
  source: ActionSource;
  fingerprint: string | null;
  ticketId: number | null;
  messageId: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
