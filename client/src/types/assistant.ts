export type MessageRole = "user" | "assistant" | "system";
export type MessageSeverity = "info" | "warn" | "error";
export type ActionType =
  | "RETRY_PHASE"
  | "REBASE_AND_CONTINUE"
  | "RESPOND_TO_PHASE"
  | "TRIGGER_PHASE"
  | "OTHER";
export type ActionStatus = "proposed" | "approved" | "rejected" | "executed" | "failed";
export type ActionSource = "auto" | "chat" | "user";

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
