import type {
  BoardTicketsResponse,
  Ticket,
  TicketPhase,
  CliType,
  Slot,
  TicketFile,
  MondayNotStartedItem,
  Project,
} from "./types";

const BASE = "/api";

export async function fetchTickets(phase?: TicketPhase, projectId?: number): Promise<Ticket[]> {
  const params = new URLSearchParams();
  if (phase) params.set("phase", phase);
  if (projectId != null) params.set("projectId", String(projectId));
  const query = params.toString();
  const res = await fetch(query ? `${BASE}/tickets?${query}` : `${BASE}/tickets`);
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return res.json();
}

export async function fetchBoardTickets(projectId?: number, donePage = 1): Promise<BoardTicketsResponse> {
  const params = new URLSearchParams({ donePage: String(donePage) });
  if (projectId != null) params.set("projectId", String(projectId));
  const res = await fetch(`${BASE}/tickets/board?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch board tickets");
  return res.json();
}

export async function createTicket(data: {
  title: string;
  description?: string;
  projectId?: number | null;
  cliType?: CliType;
}): Promise<Ticket> {
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

export async function fetchSlots(projectId?: number): Promise<Slot[]> {
  const url = projectId != null ? `${BASE}/slots?projectId=${projectId}` : `${BASE}/slots`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch slots");
  return res.json();
}

export async function createSlot(data: {
  name: string;
  rootPath: string;
  projectId?: number | null;
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

export async function fetchMondayNotStarted(projectId?: number): Promise<MondayNotStartedItem[]> {
  const url = projectId != null
    ? `${BASE}/monday/not-started?projectId=${projectId}`
    : `${BASE}/monday/not-started`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to fetch Monday tickets");
  }
  const body = await res.json();
  return body.items ?? [];
}

export async function importMondayItem(
  mondayItemId: string,
  clues?: string,
  projectId?: number | null,
): Promise<Ticket> {
  const res = await fetch(`${BASE}/monday/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mondayItemId,
      ...(clues?.trim() ? { clues } : {}),
      ...(projectId != null ? { projectId } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to import Monday item");
  }
  const body = await res.json();
  return body.ticket as Ticket;
}

// ── Projects ──────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function createProject(data: {
  name: string;
  slug?: string | null;
  mondayBoardIds?: number[] | null;
  mondayDefaultPersonId?: string | null;
  mondayDevPeople?: string[] | null;
  primaryColor?: string | null;
  actionColor?: string | null;
}): Promise<Project> {
  const res = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to create project");
  }
  return res.json();
}

export async function updateProject(
  id: number,
  data: {
    name?: string;
    slug?: string | null;
    mondayBoardIds?: number[] | null;
    mondayDefaultPersonId?: string | null;
    mondayDevPeople?: string[] | null;
    primaryColor?: string | null;
    actionColor?: string | null;
  },
): Promise<Project> {
  const res = await fetch(`${BASE}/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to update project");
  }
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${BASE}/projects/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to delete project");
  }
}
