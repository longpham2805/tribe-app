import type { AppState } from "./app";
import type { Phase, TicketPhase } from "./phases";
import type { Ticket } from "./tickets";
import type { AssistantMessage, AssistantAction } from "./assistant";

export type WsMessage =
  | { type: "hello" }
  | { type: "phase.updated"; ticketId: number; phase: Phase }
  | { type: "phase.log"; ticketId: number; phaseName: TicketPhase; event: any }
  | { type: "ticket.updated"; ticket: Ticket }
  | { type: "app-state.updated"; appState: AppState }
  | { type: "assistant.message.created"; message: AssistantMessage }
  | { type: "assistant.action.updated"; action: AssistantAction };
