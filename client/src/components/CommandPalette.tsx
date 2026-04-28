import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTickets } from "../api";
import type { PaletteAction, ShortcutIntent } from "../context/AppContext";
import { getProjectShortcutTargets } from "../utils/projectSelection";
import type { Project, Ticket } from "../types";
import "./CommandPalette.css";

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onAction: (intent: NonNullable<ShortcutIntent>) => void;
  projectId: number | null;
  canImportFromMonday: boolean;
  contextActions: PaletteAction[];
  projects: Project[];
};

const STATIC_ACTIONS = [
  { id: "new-ticket", label: "Add new ticket", icon: "+", intent: { type: "new-ticket" } as const },
  { id: "nav-tickets", label: "Go to Tickets", icon: "T", intent: { type: "navigate", view: "tickets" } as const },
  { id: "nav-slots", label: "Go to Slots", icon: "S", intent: { type: "navigate", view: "slots" } as const },
  { id: "nav-projects", label: "Go to Projects", icon: "P", intent: { type: "navigate", view: "projects" } as const },
];

const MONDAY_IMPORT_ACTION = {
  id: "import-from-monday",
  label: "Import from Monday",
  icon: "M",
  intent: { type: "import-from-monday" } as const,
};

export function CommandPalette({ open, onClose, onAction, projectId, canImportFromMonday, contextActions, projects }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

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
    const selectedItem = itemRefs.current[selected];
    const results = resultsRef.current;
    if (!selectedItem || !results) return;
    selectedItem.scrollIntoView({ block: "nearest" });
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  itemRefs.current = [];

  const projectShortcutTargets = useMemo(() => getProjectShortcutTargets(projects), [projects]);
  if (!open) return null;

  const q = query.toLowerCase();
  const filteredContext = contextActions.filter((a) => a.label.toLowerCase().includes(q));
  const actions = canImportFromMonday ? [...STATIC_ACTIONS, MONDAY_IMPORT_ACTION] : STATIC_ACTIONS;
  const filteredStatic = actions.filter((a) => a.label.toLowerCase().includes(q));
  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(q));
  const filteredTickets = tickets.filter((t) => t.title.toLowerCase().includes(q) || String(t.id).includes(q));
  const totalItems = filteredContext.length + filteredStatic.length + filteredProjects.length + filteredTickets.length;

  const handleSelect = (idx: number) => {
    if (idx < filteredContext.length) {
      filteredContext[idx].onSelect();
      onClose();
      return;
    }
    const afterContext = idx - filteredContext.length;
    if (afterContext < filteredStatic.length) {
      onAction(filteredStatic[afterContext].intent);
      onClose();
      return;
    }
    const afterStatic = afterContext - filteredStatic.length;
    if (afterStatic < filteredProjects.length) {
      onAction({ type: "switch-project", projectId: filteredProjects[afterStatic].id });
      onClose();
      return;
    }
    const ticket = filteredTickets[afterStatic - filteredProjects.length];
    if (ticket) onAction({ type: "open-ticket", ticketId: ticket.id });
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

        <div ref={resultsRef} className="cmd-results">
          {totalItems === 0 && <div className="cmd-empty">No results</div>}

          {filteredContext.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-label">Context</div>
              {filteredContext.map((action, i) => (
                <button
                  key={action.id}
                  ref={(element) => {
                    itemRefs.current[i] = element;
                  }}
                  className={`cmd-item${selected === i ? " cmd-item--selected" : ""}`}
                  onClick={() => handleSelect(i)}
                  onMouseEnter={() => setSelected(i)}
                  type="button"
                >
                  {action.icon && <span className="cmd-item-icon">{action.icon}</span>}
                  <span className="cmd-item-label">{action.label}</span>
                  <kbd className="cmd-item-shortcut">↩</kbd>
                </button>
              ))}
            </div>
          )}

          {filteredStatic.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-label">Actions</div>
              {filteredStatic.map((action, i) => {
                const globalIdx = filteredContext.length + i;
                return (
                  <button
                    key={action.id}
                    ref={(element) => {
                      itemRefs.current[globalIdx] = element;
                    }}
                    className={`cmd-item${selected === globalIdx ? " cmd-item--selected" : ""}`}
                    onClick={() => handleSelect(globalIdx)}
                    onMouseEnter={() => setSelected(globalIdx)}
                    type="button"
                  >
                    <span className="cmd-item-icon">{action.icon}</span>
                    <span className="cmd-item-label">{action.label}</span>
                    <kbd className="cmd-item-shortcut">↩</kbd>
                  </button>
                );
              })}
            </div>
          )}

          {filteredProjects.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-label">Projects</div>
              {filteredProjects.map((project, i) => {
                const globalIdx = filteredContext.length + filteredStatic.length + i;
                const shortcutKey = projectShortcutTargets.find((target) => target.projectId === project.id)?.key;
                return (
                  <button
                    key={project.id}
                    ref={(element) => {
                      itemRefs.current[globalIdx] = element;
                    }}
                    className={`cmd-item${selected === globalIdx ? " cmd-item--selected" : ""}`}
                    onClick={() => handleSelect(globalIdx)}
                    onMouseEnter={() => setSelected(globalIdx)}
                    type="button"
                  >
                    <span className="cmd-item-icon">P</span>
                    <span className="cmd-item-label">{project.name}</span>
                    <kbd className="cmd-item-shortcut">{shortcutKey ? `⌘${shortcutKey}` : "↩"}</kbd>
                  </button>
                );
              })}
            </div>
          )}

          {filteredTickets.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-label">Tickets</div>
              {filteredTickets.map((ticket, i) => {
                const globalIdx = filteredContext.length + filteredStatic.length + filteredProjects.length + i;
                return (
                  <button
                    key={ticket.id}
                    ref={(element) => {
                      itemRefs.current[globalIdx] = element;
                    }}
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
