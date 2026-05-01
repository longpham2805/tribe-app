import type { CliType } from "./app";
import type { Phase, TicketPhase } from "./phases";

export interface TicketFile {
  name: string;
  size: number;
  mtime: string;
}

export type TicketStatus = "DRAFT" | "READY";

export interface Ticket {
  id: number;
  title: string;
  description: string | null;
  status: TicketStatus;
  currentPhase: TicketPhase;
  cliType: CliType;
  mondayItemId: string | null;
  mondayBoardId?: number | null;
  branchName: string | null;
  pullRequests: Array<{ repo: string; prUrl: string; commitSha: string }> | null;
  slotId: number | null;
  waitingForSlot: boolean;
  isDone: boolean;
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
  nonDoneTotal: number;
  doneTotal: number;
  totalCount: number;
  doneHasMore: boolean;
}
