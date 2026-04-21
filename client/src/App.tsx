import { useEffect, useState } from "react";
import { fetchTickets, createTicket, updateTicket, deleteTicket } from "./api";
import type { Ticket, TicketPhase } from "./types";
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

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<TicketPhase | "">("");
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      setError(null);
      const data = await fetchTickets(filterPhase || undefined);
      setTickets(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [filterPhase]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createTicket({ title: newTitle.trim(), description: newDesc.trim() || undefined });
      setNewTitle("");
      setNewDesc("");
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handlePhaseChange = async (ticket: Ticket, phase: TicketPhase) => {
    try {
      await updateTicket(ticket.id, { currentPhase: phase });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this ticket?")) return;
    try {
      await deleteTicket(id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <h1 className="logo">Tribe</h1>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "+ New Ticket"}
          </button>
        </div>
      </header>

      <main className="main">
        {showForm && (
          <form className="new-ticket-form" onSubmit={handleCreate}>
            <h2>New Ticket</h2>
            <input
              className="input"
              placeholder="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              autoFocus
            />
            <textarea
              className="input textarea"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={3}
            />
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create Ticket"}
            </button>
          </form>
        )}

        <div className="toolbar">
          <div className="filter-tabs">
            <button
              className={`tab ${filterPhase === "" ? "active" : ""}`}
              onClick={() => setFilterPhase("")}
            >
              All
            </button>
            {PHASES.map((p) => (
              <button
                key={p}
                className={`tab ${filterPhase === p ? "active" : ""}`}
                onClick={() => setFilterPhase(p)}
                style={filterPhase === p ? { borderColor: PHASE_COLORS[p] } : {}}
              >
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
            {tickets.map((ticket) => (
              <div key={ticket.id} className="ticket-card">
                <div className="ticket-header">
                  <div className="ticket-meta">
                    <span className="ticket-id">#{ticket.id}</span>
                    <span
                      className="phase-badge"
                      style={{ background: PHASE_COLORS[ticket.currentPhase] + "22", color: PHASE_COLORS[ticket.currentPhase] }}
                    >
                      {PHASE_LABELS[ticket.currentPhase]}
                    </span>
                  </div>
                  <button className="btn-delete" onClick={() => handleDelete(ticket.id)} title="Delete">
                    ×
                  </button>
                </div>

                <h3 className="ticket-title">{ticket.title}</h3>
                {ticket.description && <p className="ticket-desc">{ticket.description}</p>}

                <div className="ticket-footer">
                  <select
                    className="phase-select"
                    value={ticket.currentPhase}
                    onChange={(e) => handlePhaseChange(ticket, e.target.value as TicketPhase)}
                  >
                    {PHASES.map((p) => (
                      <option key={p} value={p}>{PHASE_LABELS[p]}</option>
                    ))}
                  </select>
                  <span className="ticket-date">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
