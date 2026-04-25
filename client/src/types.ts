export type TicketPhase = "CREATED" | "PLANNING" | "IMPLEMENTATION" | "SHIP";

export type CliType = "CLAUDE" | "CODEX";

export interface AppState {
  id: number;
  autoTriggerEnabled: boolean;
  availableCliTypes: CliType[];
  createdAt: string;
  updatedAt: string;
}

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
  | { type: "ticket.updated"; ticket: Ticket }
  | { type: "app-state.updated"; appState: AppState };

export interface Project {
  id: number;
  name: string;
  slug: string | null;
  mondayBoardIds: number[] | null;
  mondayDefaultPersonId: string | null;
  mondayDevPeople: string[] | null;
  primaryColor: string | null;
  actionColor: string | null;
  ticketCount?: number;
  runningTicketCount?: number;
  hasRunningTickets?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: number;
  title: string;
  description: string | null;
  currentPhase: TicketPhase;
  cliType: CliType;
  mondayItemId: string | null;
  mondayBoardId?: number | null;
  branchName: string | null;
  pullRequests: Array<{ repo: string; prUrl: string; commitSha: string }> | null;
  slotId: number | null;
  waitingForSlot: boolean;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
  phases: Phase[];
}

export interface BoardTicketsResponse {
  nonDoneTickets: Ticket[];
  doneTickets: Ticket[];
  donePage: number;
  donePageSize: number;
  doneTotal: number;
  doneHasMore: boolean;
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
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
}
