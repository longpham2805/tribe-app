import type { BoardTicketsResponse, Ticket, TicketFile, TicketPhase, CliType } from "../types";
import { API_BASE, readErrorMessage, readJsonError } from "./request";

export async function fetchTickets(phase?: TicketPhase, projectId?: number): Promise<Ticket[]> {
  const params = new URLSearchParams();
  if (phase) params.set("phase", phase);
  if (projectId != null) params.set("projectId", String(projectId));
  const query = params.toString();
  const res = await fetch(query ? `${API_BASE}/tickets?${query}` : `${API_BASE}/tickets`);
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return res.json();
}

export async function fetchBoardTickets(projectId?: number, donePage = 1): Promise<BoardTicketsResponse> {
  const params = new URLSearchParams({ donePage: String(donePage) });
  if (projectId != null) params.set("projectId", String(projectId));
  const res = await fetch(`${API_BASE}/tickets/board?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch board tickets");
  return res.json();
}

export async function createTicket(data: {
  title: string;
  description?: string;
  projectId?: number | null;
  cliType?: CliType;
}): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to create ticket"));
  return res.json();
}

export async function updateTicket(
  id: number,
  data: { title?: string; description?: string; currentPhase?: TicketPhase },
): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to update ticket"));
  return res.json();
}

export async function deleteTicket(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/tickets/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete ticket");
}

export async function triggerPhase(ticketId: number, phaseName: TicketPhase): Promise<void> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/trigger-phase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phaseName }),
  });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to trigger phase"));
}

export async function respondPhase(ticketId: number, message: string): Promise<void> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/respond-phase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to respond to phase"));
}

export async function createFeedback(ticketId: number, comment: string): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to create feedback"));
  return res.json();
}

export async function fetchTicketFiles(ticketId: number): Promise<TicketFile[]> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/files`);
  if (!res.ok) throw new Error("Failed to fetch ticket files");
  return res.json();
}

export async function fetchTicketFile(ticketId: number, name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/files/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Failed to fetch ticket file");
  return res.text();
}

export async function fetchPhaseLog(ticketId: number, phaseName: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/files/_logs/${encodeURIComponent(phaseName)}`);
  if (!res.ok) throw new Error("Failed to fetch phase log");
  const body = await res.json();
  return body.events ?? [];
}
