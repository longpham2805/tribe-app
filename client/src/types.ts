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
  ticketId?: number;
  phaseName: TicketPhase;
  startedAt: string | null;
  completedAt: string | null;
  status: PhaseStatus;
  lastMessage: string | null;
}

export interface TicketFile {
  name: string;
  size: number;
  mtime: string;
}

export type WsMessage =
  | { type: "hello" }
  | { type: "phase.updated"; ticketId: number; phase: Phase }
  | { type: "phase.log"; ticketId: number; phaseName: TicketPhase; event: any }
  | { type: "ticket.updated"; ticket: Ticket };

export interface Ticket {
  id: number;
  title: string;
  description: string | null;
  currentPhase: TicketPhase;
  mondayItemId: string | null;
  mondayBoardId?: number | null;
  slotId: number | null;
  waitingForSlot: boolean;
  createdAt: string;
  updatedAt: string;
  phases: Phase[];
}

export interface MondayNotStartedItem {
  id: string;
  name: string;
  group?: {
    id: string;
    title: string;
  };
}

export interface Slot {
  id: number;
  name: string;
  rootPath: string;
  currentTicketId: number | null;
  createdAt: string;
  updatedAt: string;
}
