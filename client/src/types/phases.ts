export type TicketPhase = "CREATED" | "PLANNING" | "IMPLEMENTATION" | "SHIP" | "FEEDBACK";

export type PhaseStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "REQUIRES_ACTION"
  | "QUESTION"
  | "ERROR";

export interface Phase {
  id: number;
  ticketId?: number;
  phaseName: TicketPhase;
  sequence: number;
  feedbackComment: string | null;
  branchName: string | null;
  pullRequests: Array<{ repo: string; prUrl: string; commitSha: string }> | null;
  startedAt: string | null;
  completedAt: string | null;
  status: PhaseStatus;
  lastMessage: string | null;
}
