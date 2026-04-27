import { memo, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTicket,
  deleteTicket,
  fetchBoardTickets,
  fetchSlots,
  fetchTicketFiles,
  respondPhase,
  triggerPhase,
  updateTicket,
  uploadTicketImage,
} from "../api";
import { ImageDropZone } from "../components/tickets/ImageDropZone";
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
  TICKET_GROUP_HINTS,
  TICKET_GROUP_LABELS,
  TICKET_GROUPS,
  type TicketGroup,
} from "../constants/ticket";
import type { CliType, Phase, Slot, Ticket, TicketFile, TicketPhase, WsMessage } from "../types";
import { useAppContext, type PaletteAction } from "../context/AppContext";
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
  count,
  getSlotName,
  getProjectName,
  onOpenTicket,
  action,
}: {
  group: TicketGroup;
  tickets: Ticket[];
  count: number;
  getSlotName: (slotId: number | null) => string | null;
  getProjectName: (projectId: number | null) => string | null;
  onOpenTicket: (ticketId: number) => void;
  action?: { label: string; disabled?: boolean; onClick: () => void } | null;
}) {
  if (tickets.length === 0) return null;

  return (
    <section className="ticket-group-section">
      <div className="ticket-group-header">
        <h2 className="ticket-group-title serif">{TICKET_GROUP_LABELS[group]}</h2>
        <span className="ticket-group-count">{count}</span>
        <span className="ticket-group-rule" aria-hidden="true" />
        <span className="ticket-group-hint">{TICKET_GROUP_HINTS[group]}</span>
      </div>
      <div className="ticket-list">
        {tickets.map((ticket) => (
          <TicketSummaryCard
            key={ticket.id}
            ticket={ticket}
            assignedSlotName={getSlotName(ticket.slotId)}
            projectName={getProjectName(ticket.projectId ?? null)}
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
  const { appState, shortcutIntent, clearShortcutIntent, setPaletteContextActions, projects, selectedProjectId } = useAppContext();
  const paneWidth = 720;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreDone, setLoadingMoreDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [donePage, setDonePage] = useState(1);
  const [doneTotal, setDoneTotal] = useState(0);
  const [doneHasMore, setDoneHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [showMondayPicker, setShowMondayPicker] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCliType, setNewCliType] = useState<CliType | "">("");
  const [creating, setCreating] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [triggeringPhase, setTriggeringPhase] = useState<string | null>(null);
  const [responseDraft, setResponseDraft] = useState<Record<number, string>>({});
  const [respondingTicket, setRespondingTicket] = useState<number | null>(null);
  const [savingTicketContent, setSavingTicketContent] = useState<number | null>(null);
  const [filesByTicket, setFilesByTicket] = useState<Record<number, TicketFile[]>>({});
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ fileName: string | null } | null>(null);
  const [liveLogs, setLiveLogs] = useState<Record<string, any[]>>({});
  const [selectedPhaseByTicket, setSelectedPhaseByTicket] = useState<Record<number, TicketPhase>>({});
  const [selectedPhaseAutoOpenKeyByTicket, setSelectedPhaseAutoOpenKeyByTicket] = useState<Record<number, string>>({});

  const newTicketTitleRef = useRef<HTMLInputElement>(null);
  const ticketFileRefreshTimers = useRef<Record<number, number>>({});
  const fetchAndStoreTicketFiles = useCallback(
    async (ticketId: number) => {
      const files = await fetchTicketFiles(ticketId);
      setFilesByTicket((cur) => ({ ...cur, [ticketId]: files }));
    },
    [],
  );

  const handleSelectPhase = useCallback((ticketId: number, phase: TicketPhase) => {
    setSelectedPhaseByTicket((prev) => ({ ...prev, [ticketId]: phase }));
    setSelectedPhaseAutoOpenKeyByTicket((prev) => ({ ...prev, [ticketId]: `${ticketId}:${phase}:${Date.now()}` }));
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [ticketData, slotData] = await Promise.all([
        fetchBoardTickets(projectId ?? undefined),
        fetchSlots(projectId ?? undefined),
      ]);
      setTickets([...ticketData.nonDoneTickets, ...ticketData.doneTickets]);
      setDonePage(ticketData.donePage);
      setDoneTotal(ticketData.doneTotal);
      setDoneHasMore(ticketData.doneHasMore);
      setTotalCount(ticketData.totalCount);
      setSlots(slotData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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

  useEffect(() => {
    const actions: PaletteAction[] = [];

    if (showForm) {
      actions.push({
        id: "close-create",
        label: "Close create ticket modal",
        icon: "✕",
        onSelect: () => setShowForm(false),
      });
    } else if (selectedTicketId != null) {
      const ticket = tickets.find((t) => t.id === selectedTicketId);
      if (ticket) {
        const prs = ticket.pullRequests ?? [];
        for (const pr of prs) {
          actions.push({
            id: `open-pr-${pr.prUrl}`,
            label: prs.length === 1 ? "Open pull request" : `Open PR: ${pr.repo}`,
            icon: "↗",
            onSelect: () => window.open(pr.prUrl, "_blank"),
          });
        }
        for (const phase of PHASES) {
          actions.push({
            id: `goto-phase-${phase}`,
            label: PHASE_LABELS[phase],
            icon: "▶",
            onSelect: () => handleSelectPhase(selectedTicketId, phase),
          });
        }
      }
    }

    setPaletteContextActions(actions);
  }, [handleSelectPhase, selectedTicketId, showForm, tickets, setPaletteContextActions]);

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
  const ticketCountsByGroup = useMemo(
    () => ({
      RUNNING: ticketsByGroup.RUNNING.length,
      WAITING: ticketsByGroup.WAITING.length,
      DONE: doneTotal,
    }),
    [doneTotal, ticketsByGroup],
  );

  const slotNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const slot of slots) map.set(slot.id, slot.name);
    return map;
  }, [slots]);

  const getSlotName = useCallback((slotId: number | null) => {
    if (slotId == null) return null;
    return slotNameById.get(slotId) ?? null;
  }, [slotNameById]);

  const getProjectName = useCallback((projectId: number | null) => {
    if (projectId == null) return null;
    return projects.find((p) => p.id === projectId)?.name ?? null;
  }, [projects]);

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
    } else if (shortcutIntent.type === "import-from-monday") {
      if (canImportFromMonday) setShowMondayPicker(true);
      clearShortcutIntent();
    }
  }, [shortcutIntent, clearShortcutIntent, openTicket, canImportFromMonday]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTitle.trim()) return;
      setCreating(true);
      try {
        const ticket = await createTicket({
          title: newTitle.trim(),
          description: newDesc.trim() || undefined,
          projectId,
          cliType: newCliType || undefined,
        });
        const imageErrors: string[] = [];
        for (const file of pendingImages) {
          try {
            await uploadTicketImage(ticket.id, file);
          } catch {
            imageErrors.push(file.name);
          }
        }
        setNewTitle("");
        setNewDesc("");
        setNewCliType("");
        setPendingImages([]);
        setShowForm(false);
        await load();
        if (imageErrors.length > 0) {
          setError(`Ticket #${ticket.id} created. Failed to upload: ${imageErrors.join(", ")}. Retry via the ticket detail.`);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setCreating(false);
      }
    },
    [newTitle, newDesc, newCliType, pendingImages, projectId, load],
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
    if (loadingMoreDone || !doneHasMore) return;

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
      setDoneHasMore(boardData.doneHasMore);
      setTotalCount(boardData.totalCount);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMoreDone(false);
    }
  }, [doneHasMore, donePage, getTicketGroup, loadingMoreDone, projectId]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setNewTitle("");
    setNewDesc("");
    setNewCliType("");
    setPendingImages([]);
  }, []);

  useEffect(() => {
    if (!showForm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeForm(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm, closeForm]);

  return (
    <>
      <div
        className={`tickets-page ${paneOpen ? "tickets-page--pane-open" : ""}`}
        style={layoutStyle}
      >
        {canImportFromMonday && (
          <Modal open={showMondayPicker} onClose={() => setShowMondayPicker(false)} title="Import from Monday" width={600}>
            <MondayPicker onImported={load} projectId={projectId} />
          </Modal>
        )}

        {/* Page heading */}
        <div className="page-heading">
          <div className="page-heading__left">
            <div className="page-heading__breadcrumb">
              {selectedProjectId != null
                ? (projects.find((p) => p.id === selectedProjectId)?.name ?? "Project")
                : "All projects"
              } · Tickets
            </div>
            <h1 className="page-heading__title serif">Ticket board</h1>
            <p className="page-heading__sub">
              Tickets in flight, waiting for a slot, or shipped. Phases advance automatically; intervene only when an agent asks.
            </p>
          </div>
          <div className="page-heading__actions">
            {canImportFromMonday && (
              <button className="btn" onClick={() => setShowMondayPicker((prev) => !prev)}>
                Import from Monday
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + New Ticket
            </button>
          </div>
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
                count={ticketCountsByGroup[group]}
                getSlotName={getSlotName}
                getProjectName={getProjectName}
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
        selectedPhaseAutoOpenKey={selectedTicket ? selectedPhaseAutoOpenKeyByTicket[selectedTicket.id] : undefined}
        liveLogs={liveLogs}
        files={selectedTicket ? filesByTicket[selectedTicket.id] ?? [] : []}
        filesLoading={selectedTicket != null && !(selectedTicket.id in filesByTicket)}
        assignedSlotName={selectedTicket ? getSlotName(selectedTicket.slotId) : null}
        projectName={selectedTicket ? getProjectName(selectedTicket.projectId ?? null) : null}
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
        onSelectPhase={handleSelectPhase}
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

      {/* New Ticket Modal */}
      {showForm && (
        <div
          className="ntm-backdrop"
          onClick={closeForm}
        >
          <div className="ntm-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ntm-panel__header">
              <h2 className="serif ntm-panel__title">New ticket</h2>
              <p className="ntm-panel__sub">Tribe will route it through Created → Planning → Implementation → Ship.</p>
            </div>
            <form className="ntm-panel__form" onSubmit={handleCreate}>
              <label className="ntm-field">
                <span className="ntm-field__label">Title</span>
                <input
                  ref={newTicketTitleRef}
                  className="input"
                  placeholder="Short, action-oriented title…"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label className="ntm-field">
                <span className="ntm-field__label">Description</span>
                <textarea
                  className="input textarea"
                  placeholder="What's the problem? What does done look like?"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={4}
                />
              </label>
              <ImageDropZone files={pendingImages} onChange={setPendingImages} disabled={creating} />
              <div className="ntm-grid-2">
                <label className="ntm-field">
                  <span className="ntm-field__label">Project</span>
                  <select
                    className="input"
                    value={projectId ?? ""}
                    disabled
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    {projectId == null && <option value="">All projects</option>}
                  </select>
                </label>
                <label className="ntm-field">
                  <span className="ntm-field__label">Agent</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([
                      { k: "" as CliType | "", label: "Auto" },
                      { k: "CLAUDE" as CliType | "", label: "Claude" },
                      { k: "CODEX" as CliType | "", label: "Codex" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.k}
                        type="button"
                        disabled={opt.k !== "" && !availableCliTypes.includes(opt.k as CliType)}
                        onClick={() => setNewCliType(opt.k as CliType | "")}
                        style={{
                          flex: 1, padding: "10px 8px", borderRadius: 8,
                          background: newCliType === opt.k ? "var(--ink)" : "transparent",
                          color: newCliType === opt.k ? "var(--cream)" : "var(--ink-2)",
                          border: "1px solid",
                          borderColor: newCliType === opt.k ? "var(--ink)" : "var(--hairline-strong)",
                          cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 500,
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                          opacity: opt.k !== "" && !availableCliTypes.includes(opt.k as CliType) ? 0.4 : 1,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
              <div className="ntm-panel__footer">
                <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
                  Press <kbd style={{ fontFamily: "inherit", background: "var(--paper)", border: "1px solid var(--hairline-strong)", borderRadius: 4, padding: "1px 5px", fontSize: 10.5 }}>Esc</kbd> to cancel
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn" onClick={closeForm}>Cancel</button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={creating || !newTitle.trim()}
                  >
                    {creating ? "Creating…" : "Create ticket"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
