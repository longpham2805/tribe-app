import { memo, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTicket,
  deleteTicket,
  fetchBoardTickets,
  fetchSlots,
  fetchTicketFiles,
  fetchTickets,
  respondPhase,
  triggerPhase,
  updateTicket,
} from "../api";
import { MondayPicker } from "../components/tickets/MondayPicker";
import { TicketDetailModal } from "../components/tickets/TicketDetailModal";
import { TicketSummaryCard } from "../components/tickets/TicketSummaryCard";
import { Modal } from "../components/ui/Modal";
import {
  PAUSED_STATUSES,
  PHASE_COLORS,
  PHASE_LABELS,
  PHASES,
  STATUS_COLORS,
  STATUS_LABELS,
  TICKET_GROUP_LABELS,
  TICKET_GROUPS,
  type TicketGroup,
} from "../constants/ticket";
import type { CliType, Phase, Slot, Ticket, TicketFile, TicketPhase, WsMessage } from "../types";
import { useAppContext } from "../context/AppContext";
import { useWebSocket } from "../ws";

type TicketsPageProps = {
  projectId: number | null;
  canImportFromMonday: boolean;
};

function sortTicketsByNewest(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id - left.id);
}
const MAX_LIVE_LOG_EVENTS = 200;

const TicketGroupSection = memo(function TicketGroupSection({
  group,
  tickets,
  getSlotName,
  onOpenTicket,
  action,
}: {
  group: TicketGroup;
  tickets: Ticket[];
  getSlotName: (slotId: number | null) => string | null;
  onOpenTicket: (ticketId: number) => void;
  action?: { label: string; disabled?: boolean; onClick: () => void } | null;
}) {
  if (tickets.length === 0) return null;

  return (
    <section className="ticket-group-section">
      <div className="ticket-group-header">
        <h2 className="ticket-group-title">{TICKET_GROUP_LABELS[group]}</h2>
        <span className="count">
          {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="ticket-list">
        {tickets.map((ticket) => (
          <TicketSummaryCard
            key={ticket.id}
            ticket={ticket}
            assignedSlotName={getSlotName(ticket.slotId)}
            onOpen={() => onOpenTicket(ticket.id)}
            phaseLabels={PHASE_LABELS}
            phaseColors={PHASE_COLORS}
            statusLabels={STATUS_LABELS}
            statusColors={STATUS_COLORS}
            pausedStatuses={PAUSED_STATUSES}
          />
        ))}
      </div>
      {action && (
        <div className="ticket-group-action">
          <button className="btn ticket-group-load-more" onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </button>
        </div>
      )}
    </section>
  );
});

export function TicketsPage({ projectId, canImportFromMonday }: TicketsPageProps) {
  const { appState, shortcutIntent, clearShortcutIntent } = useAppContext();
  const paneWidth = 720;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreDone, setLoadingMoreDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterPhase, setFilterPhase] = useState<TicketPhase | "">("");
  const [donePage, setDonePage] = useState(1);
  const [doneTotal, setDoneTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showMondayPicker, setShowMondayPicker] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCliType, setNewCliType] = useState<CliType | "">("");
  const [creating, setCreating] = useState(false);
  const [triggeringPhase, setTriggeringPhase] = useState<string | null>(null);
  const [responseDraft, setResponseDraft] = useState<Record<number, string>>({});
  const [respondingTicket, setRespondingTicket] = useState<number | null>(null);
  const [savingTicketContent, setSavingTicketContent] = useState<number | null>(null);
  const [filesByTicket, setFilesByTicket] = useState<Record<number, TicketFile[]>>({});
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ fileName: string | null } | null>(null);
  const [liveLogs, setLiveLogs] = useState<Record<string, any[]>>({});
  const [selectedPhaseByTicket, setSelectedPhaseByTicket] = useState<Record<number, TicketPhase>>({});

  const newTicketTitleRef = useRef<HTMLInputElement>(null);
  const ticketFileRefreshTimers = useRef<Record<number, number>>({});
  const isBoardMode = filterPhase === "";
  const fetchAndStoreTicketFiles = useCallback(
    async (ticketId: number) => {
      const files = await fetchTicketFiles(ticketId);
      setFilesByTicket((cur) => ({ ...cur, [ticketId]: files }));
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      if (isBoardMode) {
        const [ticketData, slotData] = await Promise.all([
          fetchBoardTickets(projectId ?? undefined),
          fetchSlots(projectId ?? undefined),
        ]);
        setTickets([...ticketData.nonDoneTickets, ...ticketData.doneTickets]);
        setDonePage(ticketData.donePage);
        setDoneTotal(ticketData.doneTotal);
        setSlots(slotData);
      } else {
        const [ticketData, slotData] = await Promise.all([
          fetchTickets(filterPhase || undefined, projectId ?? undefined),
          fetchSlots(projectId ?? undefined),
        ]);
        setTickets(ticketData);
        setDonePage(1);
        setDoneTotal(0);
        setSlots(slotData);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterPhase, isBoardMode, projectId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!canImportFromMonday && showMondayPicker) setShowMondayPicker(false);
  }, [canImportFromMonday, showMondayPicker]);

  const scheduleTicketFilesRefresh = useCallback(
    (ticketId: number) => {
      if (selectedTicketId !== ticketId) return;
      const existing = ticketFileRefreshTimers.current[ticketId];
      if (existing) window.clearTimeout(existing);

      ticketFileRefreshTimers.current[ticketId] = window.setTimeout(() => {
        void fetchAndStoreTicketFiles(ticketId)
          .catch(() => {
            // ignore refresh errors
          })
          .finally(() => {
            delete ticketFileRefreshTimers.current[ticketId];
          });
      }, 2000);
    },
    [fetchAndStoreTicketFiles, selectedTicketId],
  );

  useEffect(() => {
    return () => {
      Object.values(ticketFileRefreshTimers.current).forEach((timerId) => window.clearTimeout(timerId));
      ticketFileRefreshTimers.current = {};
    };
  }, []);

  useWebSocket(
    useCallback(
      (msg: WsMessage) => {
        if (msg.type === "phase.updated") {
          const updated = msg.phase as Phase;
          setTickets((prev) =>
            prev.map((ticket) =>
              ticket.id !== msg.ticketId
                ? ticket
                : {
                    ...ticket,
                    phases: ticket.phases.map((phase) => (phase.id === updated.id ? { ...phase, ...updated } : phase)),
                  },
            ),
          );
          scheduleTicketFilesRefresh(msg.ticketId);
          return;
        }

        if (msg.type === "ticket.updated") {
          const ticket = msg.ticket as Ticket;
          if (projectId != null && ticket.projectId != null && ticket.projectId !== projectId) return;
          setTickets((prev) => {
            const found = prev.some((x) => x.id === ticket.id);
            if (found) return prev.map((x) => (x.id === ticket.id ? { ...x, ...ticket } : x));
            return [ticket, ...prev];
          });
          return;
        }

        if (msg.type === "phase.log") {
          const key = `${msg.ticketId}:${msg.phaseName}`;
          setLiveLogs((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), msg.event].slice(-MAX_LIVE_LOG_EVENTS) }));
          scheduleTicketFilesRefresh(msg.ticketId);
          return;
        }
      },
      [projectId, scheduleTicketFilesRefresh],
    ),
  );

  useEffect(() => {
    setSelectedPhaseByTicket((prev) => {
      const next = { ...prev };
      for (const ticket of tickets) {
        const active = ticket.phases.find((phase) => !!phase.startedAt && !phase.completedAt);
        if (active) next[ticket.id] = active.phaseName;
      }
      return next;
    });
  }, [tickets]);

  useEffect(() => {
    if (selectedTicketId == null) return;
    void fetchAndStoreTicketFiles(selectedTicketId).catch(() => {
      setFilesByTicket((cur) => (selectedTicketId in cur ? cur : { ...cur, [selectedTicketId]: [] }));
    });
  }, [fetchAndStoreTicketFiles, selectedTicketId]);

  const getTicketGroup = useCallback((ticket: Ticket): TicketGroup => {
    if (ticket.waitingForSlot) return "WAITING";
    const shipPhase = ticket.phases.find((phase) => phase.phaseName === "SHIP");
    if (shipPhase?.status === "COMPLETED") return "DONE";
    return "RUNNING";
  }, []);

  const ticketsByGroup = useMemo(() => {
    const groups: Record<TicketGroup, Ticket[]> = { RUNNING: [], WAITING: [], DONE: [] };
    for (const ticket of tickets) groups[getTicketGroup(ticket)].push(ticket);
    return groups;
  }, [tickets, getTicketGroup]);
  const doneHasMore = isBoardMode && ticketsByGroup.DONE.length < doneTotal;

  const slotNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const slot of slots) map.set(slot.id, slot.name);
    return map;
  }, [slots]);

  const getSlotName = useCallback((slotId: number | null) => {
    if (slotId == null) return null;
    return slotNameById.get(slotId) ?? null;
  }, [slotNameById]);

  const selectedTicket = useMemo(
    () => (selectedTicketId != null ? tickets.find((ticket) => ticket.id === selectedTicketId) ?? null : null),
    [tickets, selectedTicketId],
  );
  const availableCliTypes = useMemo(() => appState?.availableCliTypes ?? [], [appState]);
  const paneOpen = selectedTicket != null;
  const layoutStyle = useMemo(
    () => ({ "--ticket-pane-width": `${paneWidth}px` }) as CSSProperties,
    [paneWidth],
  );

  useEffect(() => {
    if (newCliType && !availableCliTypes.includes(newCliType)) {
      setNewCliType("");
    }
  }, [availableCliTypes, newCliType]);

  useEffect(() => {
    if (selectedTicketId == null) return;
    if (tickets.some((ticket) => ticket.id === selectedTicketId)) return;
    setSelectedTicketId(null);
    setViewer(null);
  }, [tickets, selectedTicketId]);

  const openTicket = useCallback((ticketId: number) => {
    setSelectedTicketId(ticketId);
    setViewer(null);
  }, []);

  useEffect(() => {
    if (!shortcutIntent) return;
    if (shortcutIntent.type === "new-ticket") {
      setShowForm(true);
      clearShortcutIntent();
      requestAnimationFrame(() => newTicketTitleRef.current?.focus());
    } else if (shortcutIntent.type === "open-ticket") {
      openTicket(shortcutIntent.ticketId);
      clearShortcutIntent();
    }
  }, [shortcutIntent, clearShortcutIntent, openTicket]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTitle.trim()) return;
      setCreating(true);
      try {
        await createTicket({
          title: newTitle.trim(),
          description: newDesc.trim() || undefined,
          projectId,
          cliType: newCliType || undefined,
        });
        setNewTitle("");
        setNewDesc("");
        setNewCliType("");
        setShowForm(false);
        await load();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setCreating(false);
      }
    },
    [newTitle, newDesc, newCliType, projectId, load],
  );

  const handleTriggerPhase = useCallback(
    async (ticketId: number, phase: TicketPhase) => {
      const key = `${ticketId}:${phase}`;
      setTriggeringPhase(key);
      try {
        await triggerPhase(ticketId, phase);
        await load();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setTriggeringPhase(null);
      }
    },
    [load],
  );

  const handleDelete = useCallback(
    async (ticketId: number) => {
      if (!confirm("Remove this ticket?")) return;
      try {
        await deleteTicket(ticketId);
        if (selectedTicketId === ticketId) {
          setSelectedTicketId(null);
          setViewer(null);
        }
        await load();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [load, selectedTicketId],
  );

  const handleUpdateTicketContent = useCallback(
    async (ticketId: number, patch: { title: string; description: string }) => {
      setSavingTicketContent(ticketId);
      setError(null);
      try {
        const updated = await updateTicket(ticketId, patch);
        setTickets((prev) => prev.map((ticket) => (ticket.id === updated.id ? { ...ticket, ...updated } : ticket)));
        await load();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update ticket";
        setError(message);
        await load();
        throw new Error(message);
      } finally {
        setSavingTicketContent(null);
      }
    },
    [load],
  );

  const handleRespond = useCallback(
    async (ticketId: number) => {
      const message = (responseDraft[ticketId] ?? "").trim();
      if (!message) return;

      const ticket = tickets.find((item) => item.id === ticketId);
      const pausedPhase = ticket?.phases.find(
        (phase) => !!phase.startedAt && !phase.completedAt && PAUSED_STATUSES.includes(phase.status),
      );
      if (pausedPhase) {
        const key = `${ticketId}:${pausedPhase.phaseName}`;
        setLiveLogs((prev) => ({
          ...prev,
          [key]: [...(prev[key] ?? []), { type: "user_message", text: message }].slice(-MAX_LIVE_LOG_EVENTS),
        }));
      }

      setRespondingTicket(ticketId);
      try {
        await respondPhase(ticketId, message);
        setResponseDraft((prev) => {
          const next = { ...prev };
          delete next[ticketId];
          return next;
        });
        await load();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setRespondingTicket(null);
      }
    },
    [responseDraft, tickets, load],
  );

  const handleLoadMoreDone = useCallback(async () => {
    if (!isBoardMode || loadingMoreDone || !doneHasMore) return;

    setLoadingMoreDone(true);
    try {
      setError(null);
      const boardData = await fetchBoardTickets(projectId ?? undefined, donePage + 1);
      setTickets((prev) => {
        const loadedDoneTickets = prev.filter((ticket) => getTicketGroup(ticket) === "DONE");
        const doneTickets = sortTicketsByNewest([...loadedDoneTickets, ...boardData.doneTickets]).filter(
          (ticket, index, all) => all.findIndex((candidate) => candidate.id === ticket.id) === index,
        );
        return [...boardData.nonDoneTickets, ...doneTickets];
      });
      setDonePage(boardData.donePage);
      setDoneTotal(boardData.doneTotal);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMoreDone(false);
    }
  }, [doneHasMore, donePage, getTicketGroup, isBoardMode, loadingMoreDone, projectId]);

  return (
    <>
      <div
        className={`tickets-page ${paneOpen ? "tickets-page--pane-open" : ""}`}
        style={layoutStyle}
      >
        {showForm && (
          <form className="new-ticket-form" onSubmit={handleCreate}>
            <h2>New Ticket</h2>
            <input
              ref={newTicketTitleRef}
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
            <select
              className="input"
              value={newCliType}
              onChange={(e) => setNewCliType(e.target.value as CliType | "")}
            >
              <option value="">Auto</option>
              <option value="CLAUDE" disabled={!availableCliTypes.includes("CLAUDE")}>
                Claude
              </option>
              <option value="CODEX" disabled={!availableCliTypes.includes("CODEX")}>
                Codex
              </option>
            </select>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={creating || (appState !== null && availableCliTypes.length === 0)}
            >
              {creating ? "Creating..." : "Create Ticket"}
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
            <button className="btn btn-primary" onClick={() => setShowForm((prev) => !prev)}>
              {showForm ? "Cancel" : "+ New Ticket"}
            </button>
            {canImportFromMonday && (
              <button className="btn" onClick={() => setShowMondayPicker((prev) => !prev)}>
                Import from Monday
              </button>
            )}
          </div>
          <div className="filter-tabs">
            <button className={`tab ${filterPhase === "" ? "active" : ""}`} onClick={() => setFilterPhase("")}>
              All
            </button>
            {PHASES.map((phase) => (
              <button
                key={phase}
                className={`tab ${filterPhase === phase ? "active" : ""}`}
                onClick={() => setFilterPhase(phase)}
                style={filterPhase === phase ? { borderColor: PHASE_COLORS[phase] } : {}}
              >
                {PHASE_LABELS[phase]}
              </button>
            ))}
          </div>
          <span className="count">
            {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
          </span>
        </div>

        {error && <div className="error">{error}</div>}

        {loading ? (
          <div className="empty">Loading...</div>
        ) : tickets.length === 0 ? (
          <div className="empty">No tickets found.</div>
        ) : (
          <div className="ticket-groups">
            {TICKET_GROUPS.map((group) => (
              <TicketGroupSection
                key={group}
                group={group}
                tickets={ticketsByGroup[group]}
                getSlotName={getSlotName}
                onOpenTicket={openTicket}
                action={group === "DONE" && doneHasMore ? {
                  label: loadingMoreDone ? "Loading..." : "Load more",
                  disabled: loadingMoreDone,
                  onClick: handleLoadMoreDone,
                } : null}
              />
            ))}
          </div>
        )}
      </div>

      <TicketDetailModal
        open={selectedTicket != null}
        paneWidth={paneWidth}
        ticket={selectedTicket}
        viewer={viewer}
        selectedPhase={selectedTicket ? selectedPhaseByTicket[selectedTicket.id] : undefined}
        liveLogs={liveLogs}
        files={selectedTicket ? filesByTicket[selectedTicket.id] ?? [] : []}
        filesLoading={selectedTicket != null && !(selectedTicket.id in filesByTicket)}
        assignedSlotName={selectedTicket ? getSlotName(selectedTicket.slotId) : null}
        triggeringPhase={triggeringPhase}
        respondingTicket={respondingTicket}
        responseDraft={selectedTicket ? responseDraft[selectedTicket.id] ?? "" : ""}
        onClose={() => {
          setSelectedTicketId(null);
          setViewer(null);
        }}
        onDelete={handleDelete}
        onUpdateContent={handleUpdateTicketContent}
        savingContent={selectedTicket ? savingTicketContent === selectedTicket.id : false}
        onTriggerPhase={handleTriggerPhase}
        onSelectPhase={(ticketId, phase) => setSelectedPhaseByTicket((prev) => ({ ...prev, [ticketId]: phase }))}
        onOpenFile={(fileName) => setViewer({ fileName })}
        onCloseFile={() => setViewer(null)}
        onResponseDraftChange={(value) => {
          if (!selectedTicket) return;
          setResponseDraft((prev) => ({ ...prev, [selectedTicket.id]: value }));
        }}
        onRespond={handleRespond}
        onImageUploaded={() => { void load(); }}
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
