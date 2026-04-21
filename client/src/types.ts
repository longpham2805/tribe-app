export type TicketPhase = "CREATED" | "BRAINSTORM" | "PLANNING" | "IMPLEMENTATION" | "SHIP";

export interface Phase {
  id: number;
  phaseName: TicketPhase;
  startedAt: string;
  completedAt: string | null;
}

export interface Ticket {
  id: number;
  title: string;
  description: string | null;
  currentPhase: TicketPhase;
  mondayItemId: string | null;
  createdAt: string;
  updatedAt: string;
  phases: Phase[];
}
