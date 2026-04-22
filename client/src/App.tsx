import { useEffect, useState } from "react";
import {
  fetchTickets, createTicket, updateTicket, deleteTicket, triggerPhase,
  fetchSlots, createSlot, updateSlot, deleteSlot,
} from "./api";
import type { Ticket, TicketPhase, Slot } from "./types";
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

type View = "tickets" | "slots";

// ── Slots Page ────────────────────────────────────────────────────────────────

function SlotsPage() {
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
      setSlots(await fetchSlots());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newRootPath.trim()) return;
    setCreating(true);
    try {
      await createSlot({ name: newName.trim(), rootPath: newRootPath.trim() });
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

function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<TicketPhase | "">("");
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [triggeringPhase, setTriggeringPhase] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const [ticketData, slotData] = await Promise.all([
        fetchTickets(filterPhase || undefined),
        fetchSlots(),
      ]);
      setTickets(ticketData);
      setSlots(slotData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, [filterPhase]);

  const slotById = (id: number | null) => slots.find((s) => s.id === id) ?? null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createTicket({ title: newTitle.trim(), description: newDesc.trim() || undefined });
      setNewTitle(""); setNewDesc(""); setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const handlePhaseChange = async (ticket: Ticket, phase: TicketPhase) => {
    try { await updateTicket(ticket.id, { currentPhase: phase }); await load(); }
    catch (e: any) { setError(e.message); }
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
    try { await deleteTicket(id); await load(); }
    catch (e: any) { setError(e.message); }
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

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Ticket"}
        </button>
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
        <div className="ticket-list">
          {tickets.map((ticket) => {
            const assignedSlot = slotById(ticket.slotId);
            return (
              <div key={ticket.id} className="ticket-card">
                <div className="ticket-header">
                  <div className="ticket-meta">
                    <span className="ticket-id">#{ticket.id}</span>
                    <span className="phase-badge"
                      style={{ background: PHASE_COLORS[ticket.currentPhase] + "22", color: PHASE_COLORS[ticket.currentPhase] }}>
                      {PHASE_LABELS[ticket.currentPhase]}
                    </span>
                    {/* Slot badge */}
                    {ticket.waitingForSlot ? (
                      <span className="phase-badge" style={{ background: "#ef444422", color: "#ef4444" }}>
                        Waiting for slot
                      </span>
                    ) : assignedSlot ? (
                      <span className="phase-badge" style={{ background: "#0ea5e922", color: "#0ea5e9" }}>
                        {assignedSlot.name}
                      </span>
                    ) : null}
                  </div>
                  <button className="btn-delete" onClick={() => handleDelete(ticket.id)} title="Delete">×</button>
                </div>

                <h3 className="ticket-title">{ticket.title}</h3>
                {ticket.description && <p className="ticket-desc">{ticket.description}</p>}

                {ticket.phases.length > 0 && (
                  <div className="phase-pipeline">
                    {PHASES.map((p) => {
                      const phaseRecord = ticket.phases.find((ph) => ph.phaseName === p);
                      const isCompleted = !!phaseRecord?.completedAt;
                      const isActive = !!phaseRecord?.startedAt && !phaseRecord?.completedAt;
                      const isPending = !phaseRecord?.startedAt;
                      const color = PHASE_COLORS[p];
                      const isBusy = triggeringPhase === `${ticket.id}:${p}`;
                      const stateLabel = isCompleted ? "Completed" : isActive ? "Active" : "Pending";
                      return (
                        <div key={p}
                          className={`phase-card ${isActive ? "phase-card--active" : ""} ${isCompleted ? "phase-card--completed" : ""} ${isPending ? "phase-card--pending" : ""}`}
                          style={isActive ? { borderColor: color } : isCompleted ? { borderColor: color + "55" } : {}}>
                          <div className="phase-card-header" style={isActive || isCompleted ? { color } : {}}>
                            <span className="phase-card-icon">{isCompleted ? "✓" : isActive ? "●" : "○"}</span>
                            <span className="phase-card-name">{PHASE_LABELS[p]}</span>
                          </div>
                          <div className="phase-card-status">{stateLabel}</div>
                          <button className="phase-card-trigger"
                            style={isActive ? { borderColor: color + "66", color } : {}}
                            disabled={isBusy} onClick={() => handleTriggerPhase(ticket.id, p)}
                            title={`Trigger ${PHASE_LABELS[p]}`}>
                            {isBusy ? "…" : "Trigger"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="ticket-footer">
                  <select className="phase-select" value={ticket.currentPhase}
                    onChange={(e) => handlePhaseChange(ticket, e.target.value as TicketPhase)}>
                    {PHASES.map((p) => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
                  </select>
                  <span className="ticket-date">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("tickets");

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <h1 className="logo">Tribe</h1>
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
            </nav>
          </div>
        </div>
      </header>

      <main className="main">
        {view === "tickets" ? <TicketsPage /> : <SlotsPage />}
      </main>
    </div>
  );
}
