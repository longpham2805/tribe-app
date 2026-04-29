import type { AppState } from "./app";
import type { Phase, TicketPhase } from "./phases";
import type { Ticket } from "./tickets";

export type WsMessage =
  | { type: "hello" }
  | { type: "phase.updated"; ticketId: number; phase: Phase }
  | { type: "phase.log"; ticketId: number; phaseName: TicketPhase; event: any }
  | { type: "ticket.updated"; ticket: Ticket }
  | { type: "app-state.updated"; appState: AppState };
