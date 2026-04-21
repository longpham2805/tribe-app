import type { Ticket, TicketPhase } from "./types";

const BASE = "/api";

export async function fetchTickets(phase?: TicketPhase): Promise<Ticket[]> {
  const url = phase ? `${BASE}/tickets?phase=${phase}` : `${BASE}/tickets`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return res.json();
}

export async function createTicket(data: { title: string; description?: string }): Promise<Ticket> {
  const res = await fetch(`${BASE}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create ticket");
  return res.json();
}

export async function updateTicket(
  id: number,
  data: { title?: string; description?: string; currentPhase?: TicketPhase }
): Promise<Ticket> {
  const res = await fetch(`${BASE}/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update ticket");
  return res.json();
}

export async function deleteTicket(id: number): Promise<void> {
  const res = await fetch(`${BASE}/tickets/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete ticket");
}
