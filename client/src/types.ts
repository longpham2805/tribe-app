export type TicketPhase = "CREATED" | "BRAINSTORM" | "PLANNING" | "IMPLEMENTATION" | "SHIP";

export type PhaseStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "REQUIRES_ACTION"
  | "QUESTION"
  | "ERROR";

export interface Phase {
  id: number;
  phaseName: TicketPhase;
  startedAt: string | null;
  completedAt: string | null;
  status: PhaseStatus;
  lastMessage: string | null;
}

export interface Ticket {
  id: number;
  title: string;
  description: string | null;
  currentPhase: TicketPhase;
  mondayItemId: string | null;
  slotId: number | null;
  waitingForSlot: boolean;
  createdAt: string;
  updatedAt: string;
  phases: Phase[];
}

export interface Slot {
  id: number;
  name: string;
  rootPath: string;
  currentTicketId: number | null;
  createdAt: string;
  updatedAt: string;
}
