import type { PhaseStatus, TicketPhase } from "../types";

export const PHASES: TicketPhase[] = ["CREATED", "BRAINSTORM", "PLANNING", "IMPLEMENTATION", "SHIP"];

export const PHASE_LABELS: Record<TicketPhase, string> = {
  CREATED: "Created",
  BRAINSTORM: "Brainstorm",
  PLANNING: "Planning",
  IMPLEMENTATION: "Implementation",
  SHIP: "Ship",
};

export const PHASE_COLORS: Record<TicketPhase, string> = {
  CREATED: "#6b7280",
  BRAINSTORM: "#8b5cf6",
  PLANNING: "#3b82f6",
  IMPLEMENTATION: "#f59e0b",
  SHIP: "#10b981",
};

export const PAUSED_STATUSES: PhaseStatus[] = ["REQUIRES_ACTION", "QUESTION", "ERROR"];

export const STATUS_LABELS: Record<PhaseStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  COMPLETED: "Completed",
  REQUIRES_ACTION: "Needs input",
  QUESTION: "Question",
  ERROR: "Error",
};

export const STATUS_COLORS: Record<PhaseStatus, string | null> = {
  PENDING: null,
  RUNNING: null,
  COMPLETED: null,
  REQUIRES_ACTION: "#f59e0b",
  QUESTION: "#f59e0b",
  ERROR: "#ef4444",
};

export const TICKET_GROUPS = ["RUNNING", "WAITING", "DONE"] as const;
export type TicketGroup = typeof TICKET_GROUPS[number];

export const TICKET_GROUP_LABELS: Record<TicketGroup, string> = {
  RUNNING: "Running",
  WAITING: "Waiting",
  DONE: "Done",
};
