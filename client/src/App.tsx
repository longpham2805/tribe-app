import { useEffect, useRef, useState } from "react";
import {
  fetchTickets, createTicket, deleteTicket, triggerPhase, respondPhase,
  fetchSlots, createSlot, updateSlot, deleteSlot,
  fetchTicketFiles, fetchProjects,
} from "./api";
import type { Ticket, TicketPhase, PhaseStatus, Phase, Slot, TicketFile, WsMessage, Project } from "./types";
import { useWebSocket } from "./ws";
import { Modal } from "./Modal";
import { MondayPicker } from "./MondayPicker";
import { ProjectsPage } from "./ProjectsPage";
import { TicketDetailModal } from "./TicketDetailModal";
import { TicketSummaryCard } from "./TicketSummaryCard";
import "./App.css";

const PHASES: TicketPhase[] = ["CREATED", "BRAINSTORM", "PLANNING", "IMPLEMENTATION", "SHIP"];

const PHASE_LABELS: Record<TicketPhase, string> = {
  CREATED: "Created",
  BRAINSTORM: "Brainstorm",
  PLANNING: "Planning",
  IMPLEMENTATION: "Implementation",
  SHIP: "Ship",
};

const PHASE_COLORS: Record<TicketPhase, string> = {
  CREATED: "#6b7280",
  BRAINSTORM: "#8b5cf6",
  PLANNING: "#3b82f6",
  IMPLEMENTATION: "#f59e0b",
  SHIP: "#10b981",
};

const PAUSED_STATUSES: PhaseStatus[] = ["REQUIRES_ACTION", "QUESTION", "ERROR"];

const STATUS_LABELS: Record<PhaseStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  COMPLETED: "Completed",
  REQUIRES_ACTION: "Needs input",
  QUESTION: "Question",
  ERROR: "Error",
};

const STATUS_COLORS: Record<PhaseStatus, string | null> = {
  PENDING: null,
  RUNNING: null,
  COMPLETED: null,
  REQUIRES_ACTION: "#f59e0b",
  QUESTION: "#f59e0b",
  ERROR: "#ef4444",
};

const TICKET_GROUPS = ["RUNNING", "WAITING", "DONE"] as const;
type TicketGroup = typeof TICKET_GROUPS[number];

const TICKET_GROUP_LABELS: Record<TicketGroup, string> = {
  RUNNING: "Running",
  WAITING: "Waiting",
  DONE: "Done",
};

type View = "tickets" | "slots" | "projects";

type StoredProjectSelection =
  | { kind: "missing" }
  | { kind: "all" }
  | { kind: "id"; id: number }
  | { kind: "invalid" };

const PROJECT_SELECTION_STORAGE_KEY = "tribe.selectedProjectId";
const ALL_PROJECTS_STORAGE_VALUE = "all";

const readStoredProjectSelection = (): StoredProjectSelection => {
  try {
    const raw = window.localStorage.getItem(PROJECT_SELECTION_STORAGE_KEY);
    if (raw == null) return { kind: "missing" };
    if (raw === ALL_PROJECTS_STORAGE_VALUE) return { kind: "all" };
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) return { kind: "id", id };
  } catch {
    return { kind: "missing" };
  }
  return { kind: "invalid" };
};

const writeStoredProjectSelection = (projectId: number | null) => {
  try {
    if (projectId == null) {
      window.localStorage.setItem(PROJECT_SELECTION_STORAGE_KEY, ALL_PROJECTS_STORAGE_VALUE);
      return;
    }
    window.localStorage.setItem(PROJECT_SELECTION_STORAGE_KEY, String(projectId));
  } catch {
    // non-fatal
  }
};

const clearStoredProjectSelection = () => {
  try {
    window.localStorage.removeItem(PROJECT_SELECTION_STORAGE_KEY);
  } catch {
    // non-fatal
  }
};

// ── Slots Page ────────────────────────────────────────────────────────────────

function SlotsPage({ projectId }: { projectId: number | null }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRootPath, setNewRootPath] = useState("");
  const [creating, setCreating] = useState(false);
  // editing state: slotId → field values
  const [editing, setEditing] = useState<Record<number, { name: string; rootPath: string }>>({});

  const load = async () => {
    try {
      setError(null);
      setSlots(await fetchSlots(projectId ?? undefined));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, [projectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newRootPath.trim()) return;
    setCreating(true);
    try {
      await createSlot({ name: newName.trim(), rootPath: newRootPath.trim(), projectId });
      setNewName(""); setNewRootPath("");
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const startEdit = (slot: Slot) => {
    setEditing((prev) => ({
      ...prev,
      [slot.id]: { name: slot.name, rootPath: slot.rootPath },
    }));
  };

  const cancelEdit = (id: number) => {
    setEditing((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const saveEdit = async (id: number) => {
    const data = editing[id];
    if (!data) return;
    try {
      await updateSlot(id, { name: data.name, rootPath: data.rootPath });
      cancelEdit(id);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this slot?")) return;
    try { await deleteSlot(id); await load(); }
    catch (e: any) { setError(e.message); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Workspace Slots</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Slot"}
        </button>
      </div>

      {showForm && (
        <form className="new-ticket-form" onSubmit={handleCreate} style={{ marginBottom: 24 }}>
          <h2>New Slot</h2>
          <input className="input" placeholder="Name (e.g. Slot 1)" value={newName}
            onChange={(e) => setNewName(e.target.value)} required autoFocus />
          <input className="input" placeholder="Root path (absolute, e.g. /workspaces/slot-1)" value={newRootPath}
            onChange={(e) => setNewRootPath(e.target.value)} required />
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create Slot"}
          </button>
        </form>
      )}

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : slots.length === 0 ? (
        <div className="empty">No slots yet. Create your first workspace slot above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {slots.map((slot) => {
            const isEditing = !!editing[slot.id];
            const ed = editing[slot.id];
            const isFree = slot.currentTicketId === null;
            return (
              <div key={slot.id} className="ticket-card" style={{ padding: "16px 20px" }}>
                <div className="ticket-header">
                  <div className="ticket-meta">
                    <span className="ticket-id">#{slot.id}</span>
                    <span
                      className="phase-badge"
                      style={{
                        background: isFree ? "#10b98122" : "#f59e0b22",
                        color: isFree ? "#10b981" : "#f59e0b",
                      }}
                    >
                      {isFree ? "Free" : `Ticket #${slot.currentTicketId}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {!isEditing && (
                      <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => startEdit(slot)}>Edit</button>
                    )}
                    <button className="btn-delete" onClick={() => handleDelete(slot.id)} title="Delete">×</button>
                  </div>
                </div>

                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    <input className="input" value={ed.name} placeholder="Name"
                      onChange={(e) => setEditing((p) => ({ ...p, [slot.id]: { ...p[slot.id], name: e.target.value } }))} />
                    <input className="input" value={ed.rootPath} placeholder="Root path"
                      onChange={(e) => setEditing((p) => ({ ...p, [slot.id]: { ...p[slot.id], rootPath: e.target.value } }))} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => saveEdit(slot.id)}>Save</button>
                      <button className="btn" style={{ fontSize: 12 }} onClick={() => cancelEdit(slot.id)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{slot.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>
                      {slot.rootPath}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tickets Page ──────────────────────────────────────────────────────────────

function TicketsPage({ projectId, canImportFromMonday }: { projectId: number | null; canImportFromMonday: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<TicketPhase | "">("");
  const [showForm, setShowForm] = useState(false);
  const [showMondayPicker, setShowMondayPicker] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [triggeringPhase, setTriggeringPhase] = useState<string | null>(null);
  const [responseDraft, setResponseDraft] = useState<Record<number, string>>({});
  const [respondingTicket, setRespondingTicket] = useState<number | null>(null);

  useEffect(() => {
    if (!canImportFromMonday && showMondayPicker) {
      setShowMondayPicker(false);
    }
  }, [canImportFromMonday, showMondayPicker]);

  // Per-ticket file list cache
  const [filesByTicket, setFilesByTicket] = useState<Record<number, TicketFile[]>>({});
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ fileName: string | null } | null>(null);
  // Live streaming phase.log events keyed by "ticketId:phaseName"
  const [liveLogs, setLiveLogs] = useState<Record<string, any[]>>({});
  // Selected phase for activity feed per ticket; auto-follows the active phase
  const [selectedPhaseByTicket, setSelectedPhaseByTicket] = useState<Record<number, TicketPhase>>({});
  const ticketFileRefreshTimers = useRef<Record<number, number>>({});

  const load = async () => {
    try {
      setError(null);
      const [ticketData, slotData] = await Promise.all([
        fetchTickets(filterPhase || undefined, projectId ?? undefined),
        fetchSlots(projectId ?? undefined),
      ]);
      setTickets(ticketData);
      setSlots(slotData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, [filterPhase, projectId]);

  const scheduleTicketFilesRefresh = (ticketId: number) => {
    const existing = ticketFileRefreshTimers.current[ticketId];
    if (existing) window.clearTimeout(existing);
    ticketFileRefreshTimers.current[ticketId] = window.setTimeout(() => {
      fetchTicketFiles(ticketId)
        .then((files) => setFilesByTicket((cur) => ({ ...cur, [ticketId]: files })))
        .catch(() => { /* ignore */ })
        .finally(() => {
          delete ticketFileRefreshTimers.current[ticketId];
        });
    }, 2000);
  };

  useEffect(() => {
    return () => {
      Object.values(ticketFileRefreshTimers.current).forEach((timerId) => window.clearTimeout(timerId));
      ticketFileRefreshTimers.current = {};
    };
  }, []);

  // Realtime: WebSocket replaces polling.
  useWebSocket((msg: WsMessage) => {
    if (msg.type === "phase.updated") {
      const updated = msg.phase as Phase;
      setTickets((prev) =>
        prev.map((t) =>
          t.id !== msg.ticketId
            ? t
            : {
                ...t,
                phases: t.phases.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
              },
        ),
      );
      scheduleTicketFilesRefresh(msg.ticketId);
    } else if (msg.type === "ticket.updated") {
      const t = msg.ticket as Ticket;
      // Only merge if it belongs to the current project view (or no project filter)
      if (projectId != null && t.projectId != null && t.projectId !== projectId) return;
      setTickets((prev) => {
        const found = prev.some((x) => x.id === t.id);
        if (found) return prev.map((x) => (x.id === t.id ? { ...x, ...t } : x));
        return [t, ...prev];
      });
    } else if (msg.type === "phase.log") {
      const key = `${msg.ticketId}:${msg.phaseName}`;
      setLiveLogs((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), msg.event] }));
      scheduleTicketFilesRefresh(msg.ticketId);
    }
  });

  // Auto-select the active/paused phase whenever tickets change.
  useEffect(() => {
    setSelectedPhaseByTicket((prev) => {
      const next = { ...prev };
      for (const ticket of tickets) {
        const active = ticket.phases.find((ph) => !!ph.startedAt && !ph.completedAt);
        if (active) next[ticket.id] = active.phaseName;
      }
      return next;
    });
  }, [tickets]);

  // Load files for each visible ticket once.
  useEffect(() => {
    const missing = tickets.filter((t) => !(t.id in filesByTicket));
    if (missing.length === 0) return;
    Promise.all(
      missing.map((t) =>
        fetchTicketFiles(t.id)
          .then((files) => [t.id, files] as [number, TicketFile[]])
          .catch(() => [t.id, [] as TicketFile[]] as [number, TicketFile[]]),
      ),
    ).then((pairs) => {
      setFilesByTicket((prev) => {
        const next = { ...prev };
        for (const [id, files] of pairs) next[id] = files;
        return next;
      });
    });
  }, [tickets, filesByTicket]);

  const slotById = (id: number | null) => slots.find((s) => s.id === id) ?? null;

  const getTicketGroup = (ticket: Ticket): TicketGroup => {
    if (ticket.waitingForSlot) return "WAITING";
    const shipPhase = ticket.phases.find((phase) => phase.phaseName === "SHIP");
    if (shipPhase?.status === "COMPLETED") return "DONE";
    return "RUNNING";
  };

  const ticketsByGroup = TICKET_GROUPS.reduce<Record<TicketGroup, Ticket[]>>(
    (groups, group) => ({ ...groups, [group]: [] }),
    { RUNNING: [], WAITING: [], DONE: [] },
  );

  for (const ticket of tickets) {
    ticketsByGroup[getTicketGroup(ticket)].push(ticket);
  }

  const selectedTicket = selectedTicketId != null
    ? tickets.find((ticket) => ticket.id === selectedTicketId) ?? null
    : null;

  useEffect(() => {
    if (selectedTicketId == null) return;
    if (tickets.some((ticket) => ticket.id === selectedTicketId)) return;
    setSelectedTicketId(null);
    setViewer(null);
  }, [tickets, selectedTicketId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createTicket({ title: newTitle.trim(), description: newDesc.trim() || undefined, projectId });
      setNewTitle(""); setNewDesc(""); setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const handleTriggerPhase = async (ticketId: number, phase: TicketPhase) => {
    const key = `${ticketId}:${phase}`;
    setTriggeringPhase(key);
    try { await triggerPhase(ticketId, phase); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setTriggeringPhase(null); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this ticket?")) return;
    try {
      await deleteTicket(id);
      if (selectedTicketId === id) {
        setSelectedTicketId(null);
        setViewer(null);
      }
      await load();
    }
    catch (e: any) { setError(e.message); }
  };

  const handleRespond = async (ticketId: number) => {
    const message = (responseDraft[ticketId] ?? "").trim();
    if (!message) return;

    const ticket = tickets.find((t) => t.id === ticketId);
    const pausedPhase = ticket?.phases.find(
      (ph) => !!ph.startedAt && !ph.completedAt && PAUSED_STATUSES.includes(ph.status),
    );
    if (pausedPhase) {
      const key = `${ticketId}:${pausedPhase.phaseName}`;
      setLiveLogs((prev) => ({
        ...prev,
        [key]: [...(prev[key] ?? []), { type: "user_message", text: message }],
      }));
    }

    setRespondingTicket(ticketId);
    try {
      await respondPhase(ticketId, message);
      setResponseDraft((prev) => { const next = { ...prev }; delete next[ticketId]; return next; });
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setRespondingTicket(null); }
  };

  return (
    <>
      {showForm && (
        <form className="new-ticket-form" onSubmit={handleCreate}>
          <h2>New Ticket</h2>
          <input className="input" placeholder="Title" value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)} required autoFocus />
          <textarea className="input textarea" placeholder="Description (optional)"
            value={newDesc} onChange={(e) => setNewDesc(e.target.value)} rows={3} />
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create Ticket"}
          </button>
        </form>
      )}

      {canImportFromMonday && (
        <Modal open={showMondayPicker} onClose={() => setShowMondayPicker(false)} title="Import from Monday" width={600}>
          <MondayPicker onImported={load} projectId={projectId} />
        </Modal>
      )}

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "+ New Ticket"}
          </button>
          {canImportFromMonday && (
            <button className="btn" onClick={() => setShowMondayPicker((prev) => !prev)}>
              Import from Monday
            </button>
          )}
        </div>
        <div className="filter-tabs">
          <button className={`tab ${filterPhase === "" ? "active" : ""}`} onClick={() => setFilterPhase("")}>All</button>
          {PHASES.map((p) => (
            <button key={p} className={`tab ${filterPhase === p ? "active" : ""}`}
              onClick={() => setFilterPhase(p)}
              style={filterPhase === p ? { borderColor: PHASE_COLORS[p] } : {}}>
              {PHASE_LABELS[p]}
            </button>
          ))}
        </div>
        <span className="count">{tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</span>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="empty">No tickets found.</div>
      ) : (
        <div className="ticket-groups">
          {TICKET_GROUPS.map((group) => {
            const groupedTickets = ticketsByGroup[group];
            if (groupedTickets.length === 0) return null;

            return (
              <section key={group} className="ticket-group-section">
                <div className="ticket-group-header">
                  <h2 className="ticket-group-title">{TICKET_GROUP_LABELS[group]}</h2>
                  <span className="count">
                    {groupedTickets.length} ticket{groupedTickets.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="ticket-list">
                  {groupedTickets.map((ticket) => {
                    const assignedSlot = slotById(ticket.slotId);
                    return (
                      <TicketSummaryCard
                        key={ticket.id}
                        ticket={ticket}
                        assignedSlotName={assignedSlot?.name ?? null}
                        onOpen={() => {
                          setSelectedTicketId(ticket.id);
                          setViewer(null);
                        }}
                        phaseLabels={PHASE_LABELS}
                        phaseColors={PHASE_COLORS}
                        statusLabels={STATUS_LABELS}
                        statusColors={STATUS_COLORS}
                        pausedStatuses={PAUSED_STATUSES}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <TicketDetailModal
        open={selectedTicket != null}
        ticket={selectedTicket}
        viewer={viewer}
        selectedPhase={selectedTicket ? selectedPhaseByTicket[selectedTicket.id] : undefined}
        liveLogs={liveLogs}
        files={selectedTicket ? filesByTicket[selectedTicket.id] ?? [] : []}
        assignedSlotName={selectedTicket ? slotById(selectedTicket.slotId)?.name ?? null : null}
        triggeringPhase={triggeringPhase}
        respondingTicket={respondingTicket}
        responseDraft={selectedTicket ? responseDraft[selectedTicket.id] ?? "" : ""}
        onClose={() => {
          setSelectedTicketId(null);
          setViewer(null);
        }}
        onDelete={handleDelete}
        onTriggerPhase={handleTriggerPhase}
        onSelectPhase={(ticketId, phase) =>
          setSelectedPhaseByTicket((prev) => ({ ...prev, [ticketId]: phase }))
        }
        onOpenFile={(fileName) => setViewer({ fileName })}
        onCloseFile={() => setViewer(null)}
        onResponseDraftChange={(value) => {
          if (!selectedTicket) return;
          setResponseDraft((prev) => ({ ...prev, [selectedTicket.id]: value }));
        }}
        onRespond={handleRespond}
        phases={PHASES}
        phaseLabels={PHASE_LABELS}
        phaseColors={PHASE_COLORS}
        statusLabels={STATUS_LABELS}
        statusColors={STATUS_COLORS}
        pausedStatuses={PAUSED_STATUSES}
      />
    </>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("tickets");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const selectedProject = selectedProjectId != null
    ? projects.find((project) => project.id === selectedProjectId) ?? null
    : null;
  const canImportFromMonday = !!selectedProject?.mondayBoardIds?.length;

  const loadProjects = async () => {
    try {
      const list = await fetchProjects();
      const storedSelection = readStoredProjectSelection();
      setProjects(list);

      if (list.length === 0) {
        setSelectedProjectId(null);
        if (storedSelection.kind === "invalid") clearStoredProjectSelection();
        return;
      }

      if (storedSelection.kind === "id") {
        const savedProject = list.find((project) => project.id === storedSelection.id);
        if (savedProject) {
          setSelectedProjectId(savedProject.id);
          return;
        }
        clearStoredProjectSelection();
      }

      if (storedSelection.kind === "all") {
        setSelectedProjectId(null);
        return;
      }

      if (storedSelection.kind === "invalid") {
        clearStoredProjectSelection();
      }

      setSelectedProjectId((currentProjectId) => {
        if (currentProjectId != null && list.some((project) => project.id === currentProjectId)) {
          return currentProjectId;
        }
        return list[0].id;
      });
    } catch {
      // non-fatal
    }
  };

  useEffect(() => { loadProjects(); }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <h1 className="logo">Tribe</h1>
            {projects.length > 1 && (
              <select
                value={selectedProjectId ?? ""}
                onChange={(e) => {
                  const nextProjectId = e.target.value ? Number(e.target.value) : null;
                  setSelectedProjectId(nextProjectId);
                  writeStoredProjectSelection(nextProjectId);
                }}
                style={{
                  background: "#1e2a3a",
                  color: "#e2e8f0",
                  border: "1px solid #2d3e50",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <nav style={{ display: "flex", gap: 4 }}>
              <button
                className={`tab ${view === "tickets" ? "active" : ""}`}
                onClick={() => setView("tickets")}
              >
                Tickets
              </button>
              <button
                className={`tab ${view === "slots" ? "active" : ""}`}
                onClick={() => setView("slots")}
              >
                Slots
              </button>
              <button
                className={`tab ${view === "projects" ? "active" : ""}`}
                onClick={() => setView("projects")}
              >
                Projects
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="main">
        {view === "tickets" && <TicketsPage projectId={selectedProjectId} canImportFromMonday={canImportFromMonday} />}
        {view === "slots" && <SlotsPage projectId={selectedProjectId} />}
        {view === "projects" && <ProjectsPage onProjectsChanged={loadProjects} />}
      </main>
    </div>
  );
}
