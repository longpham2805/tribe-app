import type { Ticket } from "../../../types";
import type { TicketGroup } from "../../../constants/ticket";

export const MAX_LIVE_LOG_EVENTS = 200;

export function sortTicketsByNewest(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id - left.id);
}

export function getTicketGroup(ticket: Ticket): TicketGroup {
  if (ticket.waitingForSlot) return "WAITING";
  if (ticket.phases.some((phase) => !!phase.startedAt && !phase.completedAt)) return "RUNNING";
  const shipPhase = ticket.phases.find((phase) => phase.phaseName === "SHIP");
  if (shipPhase?.status === "COMPLETED") return "DONE";
  return "RUNNING";
}

export function groupTicketsByBoardState(tickets: Ticket[]): Record<TicketGroup, Ticket[]> {
  const groups: Record<TicketGroup, Ticket[]> = { RUNNING: [], WAITING: [], DONE: [] };
  for (const ticket of tickets) groups[getTicketGroup(ticket)].push(ticket);
  return groups;
}
