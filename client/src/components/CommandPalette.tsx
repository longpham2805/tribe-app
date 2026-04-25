import { useEffect, useRef, useState } from "react";
import { fetchTickets } from "../api";
import type { ShortcutIntent } from "../context/AppContext";
import type { Ticket } from "../types";
import "./CommandPalette.css";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onAction: (intent: NonNullable<ShortcutIntent>) => void;
  projectId: number | null;
};

const STATIC_ACTIONS = [
  { id: "new-ticket", label: "Add new ticket", icon: "+", intent: { type: "new-ticket" } as const },
];

export function CommandPalette({ open, onClose, onAction, projectId }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setTickets([]);
    if (projectId == null) return;
    fetchTickets(undefined, projectId).then(setTickets).catch(() => setTickets([]));
  }, [open, projectId]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.toLowerCase();
  const filteredStatic = STATIC_ACTIONS.filter((a) => a.label.toLowerCase().includes(q));
  const filteredTickets = tickets.filter((t) => t.title.toLowerCase().includes(q));
  const totalItems = filteredStatic.length + filteredTickets.length;

  const handleSelect = (idx: number) => {
    if (idx < filteredStatic.length) {
      onAction(filteredStatic[idx].intent);
    } else {
      const ticket = filteredTickets[idx - filteredStatic.length];
      if (ticket) onAction({ type: "open-ticket", ticketId: ticket.id });
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      handleSelect(selected);
    }
  };

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-search">
          <span className="cmd-search-icon">⌘</span>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Search actions or tickets…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="cmd-esc-hint">esc</kbd>
        </div>

        <div className="cmd-results">
          {totalItems === 0 && <div className="cmd-empty">No results</div>}

          {filteredStatic.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-label">Actions</div>
              {filteredStatic.map((action, i) => (
                <button
                  key={action.id}
                  className={`cmd-item${selected === i ? " cmd-item--selected" : ""}`}
                  onClick={() => handleSelect(i)}
                  onMouseEnter={() => setSelected(i)}
                  type="button"
                >
                  <span className="cmd-item-icon">{action.icon}</span>
                  <span className="cmd-item-label">{action.label}</span>
                  <kbd className="cmd-item-shortcut">↩</kbd>
                </button>
              ))}
            </div>
          )}

          {filteredTickets.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-label">Tickets</div>
              {filteredTickets.map((ticket, i) => {
                const globalIdx = filteredStatic.length + i;
                return (
                  <button
                    key={ticket.id}
                    className={`cmd-item${selected === globalIdx ? " cmd-item--selected" : ""}`}
                    onClick={() => handleSelect(globalIdx)}
                    onMouseEnter={() => setSelected(globalIdx)}
                    type="button"
                  >
                    <span className="cmd-item-id">#{ticket.id}</span>
                    <span className="cmd-item-label">{ticket.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="cmd-footer">
          <span className="cmd-hint">
            <kbd>↑↓</kbd> navigate
          </span>
          <span className="cmd-hint">
            <kbd>↩</kbd> select
          </span>
          <span className="cmd-hint">
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
