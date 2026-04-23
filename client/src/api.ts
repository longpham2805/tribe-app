import type { Ticket, TicketPhase, Slot, TicketFile, MondayNotStartedItem } from "./types";

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

export async function triggerPhase(ticketId: number, phaseName: TicketPhase): Promise<void> {
  const res = await fetch(`${BASE}/tickets/${ticketId}/trigger-phase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phaseName }),
  });
  if (!res.ok) throw new Error("Failed to trigger phase");
}

export async function respondPhase(ticketId: number, message: string): Promise<void> {
  const res = await fetch(`${BASE}/tickets/${ticketId}/respond-phase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to respond to phase");
  }
}

// ── Slots ─────────────────────────────────────────────────────────

export async function fetchSlots(): Promise<Slot[]> {
  const res = await fetch(`${BASE}/slots`);
  if (!res.ok) throw new Error("Failed to fetch slots");
  return res.json();
}

export async function createSlot(data: {
  name: string;
  rootPath: string;
}): Promise<Slot> {
  const res = await fetch(`${BASE}/slots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create slot");
  return res.json();
}

export async function updateSlot(
  id: number,
  data: { name?: string; rootPath?: string }
): Promise<Slot> {
  const res = await fetch(`${BASE}/slots/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update slot");
  return res.json();
}

export async function deleteSlot(id: number): Promise<void> {
  const res = await fetch(`${BASE}/slots/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to delete slot");
  }
}

// ── Ticket files ──────────────────────────────────────────────────

export async function fetchTicketFiles(ticketId: number): Promise<TicketFile[]> {
  const res = await fetch(`${BASE}/tickets/${ticketId}/files`);
  if (!res.ok) throw new Error("Failed to fetch ticket files");
  return res.json();
}

export async function fetchTicketFile(ticketId: number, name: string): Promise<string> {
  const res = await fetch(`${BASE}/tickets/${ticketId}/files/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Failed to fetch ticket file");
  return res.text();
}

export async function fetchPhaseLog(ticketId: number, phaseName: string): Promise<any[]> {
  const res = await fetch(`${BASE}/tickets/${ticketId}/files/_logs/${encodeURIComponent(phaseName)}`);
  if (!res.ok) throw new Error("Failed to fetch phase log");
  const body = await res.json();
  return body.events ?? [];
}

// ── Monday import ─────────────────────────────────────────────────

export async function fetchMondayNotStarted(): Promise<MondayNotStartedItem[]> {
  const res = await fetch(`${BASE}/monday/not-started`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to fetch Monday tickets");
  }
  const body = await res.json();
  return body.items ?? [];
}

export async function importMondayItem(mondayItemId: string): Promise<Ticket> {
  const res = await fetch(`${BASE}/monday/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mondayItemId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to import Monday item");
  }
  const body = await res.json();
  return body.ticket as Ticket;
}
