import type { BoardTicketsResponse, Ticket, TicketFile, TicketPhase, CliType, PhaseLogEvent } from "../types";
import { API_BASE, readApiError, readJson } from "./request";

export type TicketCreatePayload = {
  title: string;
  description?: string;
  projectId?: number | null;
  cliType?: CliType;
};

export type TicketUpdatePayload = {
  title?: string;
  description?: string;
  currentPhase?: TicketPhase;
};

export type PhaseTriggerPayload = {
  phaseName: TicketPhase;
};

export type PhaseResponsePayload = {
  message: string;
};

type PhaseLogResponse = {
  events?: unknown;
};

function phaseLogEventsFromBody(body: unknown): PhaseLogEvent[] {
  if (!body || typeof body !== "object" || !("events" in body)) return [];
  const events = (body as { events?: unknown }).events;
  return Array.isArray(events) ? (events as PhaseLogEvent[]) : [];
}

export async function fetchTickets(phase?: TicketPhase, projectId?: number): Promise<Ticket[]> {
  const params = new URLSearchParams();
  if (phase) params.set("phase", phase);
  if (projectId != null) params.set("projectId", String(projectId));
  const query = params.toString();
  const res = await fetch(query ? `${API_BASE}/tickets?${query}` : `${API_BASE}/tickets`);
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return readJson<Ticket[]>(res);
}

export async function fetchBoardTickets(projectId?: number, donePage = 1): Promise<BoardTicketsResponse> {
  const params = new URLSearchParams({ donePage: String(donePage) });
  if (projectId != null) params.set("projectId", String(projectId));
  const res = await fetch(`${API_BASE}/tickets/board?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch board tickets");
  return readJson<BoardTicketsResponse>(res);
}

export async function fetchTicket(id: number): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/tickets/${id}`);
  if (!res.ok) throw new Error("Failed to fetch ticket");
  return readJson<Ticket>(res);
}

export async function createTicket(data: TicketCreatePayload): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to create ticket"));
  return readJson<Ticket>(res);
}

export async function updateTicket(
  id: number,
  data: TicketUpdatePayload,
): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to update ticket"));
  return readJson<Ticket>(res);
}

export async function deleteTicket(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/tickets/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete ticket");
}

export async function triggerPhase(ticketId: number, phaseName: TicketPhase): Promise<void> {
  const payload: PhaseTriggerPayload = { phaseName };
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/trigger-phase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to trigger phase"));
}

export async function respondPhase(ticketId: number, message: string): Promise<void> {
  const payload: PhaseResponsePayload = { message };
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/respond-phase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to respond to phase"));
}

export async function createFeedback(ticketId: number, comment: string): Promise<Ticket> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to create feedback"));
  return readJson<Ticket>(res);
}

export async function fetchTicketFiles(ticketId: number): Promise<TicketFile[]> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/files`);
  if (!res.ok) throw new Error("Failed to fetch ticket files");
  return readJson<TicketFile[]>(res);
}

export async function fetchTicketFile(ticketId: number, name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/files/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Failed to fetch ticket file");
  return res.text();
}

export async function fetchPhaseLog(ticketId: number, phaseName: string): Promise<PhaseLogEvent[]> {
  const res = await fetch(`${API_BASE}/tickets/${ticketId}/files/_logs/${encodeURIComponent(phaseName)}`);
  if (!res.ok) throw new Error("Failed to fetch phase log");
  const body = await readJson<PhaseLogResponse>(res);
  return phaseLogEventsFromBody(body);
}
