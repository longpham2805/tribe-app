import { lazy, Suspense, type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { CreateTicketModal } from "../components/tickets/CreateTicketModal";
import { TicketGroupSection } from "../components/tickets/TicketGroupSection";
import { useTicketBoardData } from "../components/tickets/hooks/useTicketBoardData";
import { useTicketFiles } from "../components/tickets/hooks/useTicketFiles";
import { useTicketLiveUpdates } from "../components/tickets/hooks/useTicketLiveUpdates";
import { useTicketMutations } from "../components/tickets/hooks/useTicketMutations";
import { groupTicketsByBoardState } from "../components/tickets/utils/ticketBoard";
import { Modal } from "../components/ui/Modal";
import {
  PAUSED_STATUSES,
  PHASE_COLORS,
  PHASE_LABELS,
  PHASES,
  STATUS_COLORS,
  STATUS_LABELS,
  TICKET_GROUPS,
} from "../constants/ticket";
import type { PhaseLogMap, TicketPhase } from "../types";
import { useAppContext, type PaletteAction } from "../context/AppContext";

const MondayPicker = lazy(() => import("../components/tickets/MondayPicker").then((module) => ({ default: module.MondayPicker })));
const TicketDetailModal = lazy(() => import("../components/tickets/TicketDetailModal").then((module) => ({ default: module.TicketDetailModal })));

type TicketsPageProps = {
  projectId: number | null;
  canImportFromMonday: boolean;
  assistantOpen: boolean;
};

export function TicketsPage({ projectId, canImportFromMonday, assistantOpen }: TicketsPageProps) {
  const { appState, shortcutIntent, clearShortcutIntent, setPaletteContextActions, projects, selectedProjectId } = useAppContext();
  const paneWidth = 720;
  const {
    tickets,
    setTickets,
    slots,
    loading,
    loadingMoreDone,
    error,
    setError,
    doneTotal,
    doneHasMore,
    load,
    loadMoreDone,
  } = useTicketBoardData(projectId);
  const [showForm, setShowForm] = useState(false);
  const [showMondayPicker, setShowMondayPicker] = useState(false);
  const [mondayPickerStep, setMondayPickerStep] = useState<"browse" | "configure">("browse");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ fileName: string | null } | null>(null);
  const [liveLogs, setLiveLogs] = useState<PhaseLogMap>({});
  const [selectedPhaseByTicket, setSelectedPhaseByTicket] = useState<Record<number, TicketPhase>>({});
  const { filesByTicket, scheduleTicketFilesRefresh } = useTicketFiles(selectedTicketId);

  const handleSelectPhase = useCallback((ticketId: number, phase: TicketPhase) => {
    setSelectedPhaseByTicket((prev) => ({ ...prev, [ticketId]: phase }));
  }, []);

  useEffect(() => {
    if (!canImportFromMonday && showMondayPicker) setShowMondayPicker(false);
  }, [canImportFromMonday, showMondayPicker]);
  useTicketLiveUpdates({ projectId, setTickets, setLiveLogs, scheduleTicketFilesRefresh });

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

  const ticketsByGroup = useMemo(() => groupTicketsByBoardState(tickets), [tickets]);
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
  const emptyTicketTitle = selectedProjectId != null ? "No tickets in this project yet" : "No tickets on the board yet";
  const emptyTicketDescription = selectedProjectId != null
    ? "Create a ticket for this project, or import Monday items once board IDs are configured."
    : "Create the first ticket manually, then assign it to a project when the work is ready.";
  const availableCliTypes = useMemo(() => appState?.availableCliTypes ?? [], [appState]);
  const paneOpen = selectedTicket != null;
  const rightPaneOffset = assistantOpen ? "var(--assistant-drawer-width)" : "0px";
  const layoutStyle = useMemo(
    () => ({ "--ticket-pane-width": `${paneWidth}px` }) as CSSProperties,
    [paneWidth],
  );

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
    } else if (shortcutIntent.type === "open-ticket") {
      openTicket(shortcutIntent.ticketId);
      clearShortcutIntent();
    } else if (shortcutIntent.type === "import-from-monday") {
      if (canImportFromMonday) setShowMondayPicker(true);
      clearShortcutIntent();
    }
  }, [shortcutIntent, clearShortcutIntent, openTicket, canImportFromMonday]);

  const {
    creating,
    triggeringPhase,
    responseDraft,
    respondingTicket,
    creatingFeedbackTicket,
    savingTicketContent,
    handleCreate,
    handleTriggerPhase,
    handleDelete,
    handleUpdateTicketContent,
    handleRespond,
    handleCreateFeedback,
    handleResponseDraftChange,
  } = useTicketMutations({
    projectId,
    tickets,
    selectedTicketId,
    selectedTicket,
    setSelectedTicketId,
    setViewer,
    setTickets,
    setLiveLogs,
    setError,
    load,
    onCreateSuccess: () => setShowForm(false),
  });

  const closeForm = useCallback(() => {
    setShowForm(false);
  }, []);

  const handleCloseMondayPicker = useCallback(() => {
    setShowMondayPicker(false);
    setMondayPickerStep("browse");
  }, []);

  const handleOpenMondayPicker = useCallback(() => {
    setShowMondayPicker(true);
  }, []);

  return (
    <>
      <div
        className={`tickets-page ${paneOpen ? "tickets-page--pane-open" : ""}`}
        style={layoutStyle}
      >
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
              <button className="btn monday-import__trigger-btn" onClick={handleOpenMondayPicker}>
                <span className="monday-import__dots" aria-hidden="true"><span /><span /><span /></span>
                Import from Monday
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + New Ticket
            </button>
          </div>
        </div>

        {error && (
          <section className="page-state page-state--error" role="alert">
            <div className="page-state__eyebrow">Ticket load failed</div>
            <h2 className="page-state__title">Could not refresh the ticket board.</h2>
            <p className="page-state__description">{error}</p>
            <div className="page-state__actions">
              <button className="btn" onClick={load}>Retry</button>
            </div>
          </section>
        )}

        {loading ? (
          <section className="loading-rows" aria-busy="true" aria-label="Loading tickets">
            <div className="loading-row" />
            <div className="loading-row" />
            <div className="loading-row" />
          </section>
        ) : tickets.length === 0 ? (
          <section className="page-state">
            <div className="page-state__eyebrow">Empty board</div>
            <h2 className="page-state__title">{emptyTicketTitle}</h2>
            <p className="page-state__description">{emptyTicketDescription}</p>
            <div className="page-state__actions">
              {canImportFromMonday ? (
                <button className="btn" onClick={handleOpenMondayPicker}>Import from Monday</button>
              ) : selectedProjectId != null ? (
                <div className="page-state__note">Monday import unavailable: add board IDs in project settings to enable imports.</div>
              ) : null}
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ New Ticket</button>
            </div>
          </section>
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
                  label: loadingMoreDone ? "Loading more" : "Load more",
                  disabled: loadingMoreDone,
                  onClick: loadMoreDone,
                } : null}
              />
            ))}
          </div>
        )}
      </div>

      {selectedTicket && (
        <Suspense fallback={<Modal open onClose={() => setSelectedTicketId(null)} title="Ticket details" variant="right-pane" width={paneWidth} rightOffset={rightPaneOffset}>Loading ticket details...</Modal>}>
          <TicketDetailModal
            open
            paneWidth={paneWidth}
            rightPaneOffset={rightPaneOffset}
            ticket={selectedTicket}
            viewer={viewer}
            selectedPhase={selectedPhaseByTicket[selectedTicket.id]}
            liveLogs={liveLogs}
            files={filesByTicket[selectedTicket.id] ?? []}
            filesLoading={!(selectedTicket.id in filesByTicket)}
            assignedSlotName={getSlotName(selectedTicket.slotId)}
            projectName={getProjectName(selectedTicket.projectId ?? null)}
            triggeringPhase={triggeringPhase}
            respondingTicket={respondingTicket}
            responseDraft={responseDraft[selectedTicket.id] ?? ""}
            onClose={() => {
              setSelectedTicketId(null);
              setViewer(null);
            }}
            onDelete={handleDelete}
            onUpdateContent={handleUpdateTicketContent}
            savingContent={savingTicketContent === selectedTicket.id}
            onTriggerPhase={handleTriggerPhase}
            onSelectPhase={handleSelectPhase}
            onOpenFile={(fileName) => setViewer({ fileName })}
            onCloseFile={() => setViewer(null)}
            onResponseDraftChange={handleResponseDraftChange}
            onRespond={handleRespond}
            onCreateFeedback={handleCreateFeedback}
            creatingFeedbackTicket={creatingFeedbackTicket}
            phases={PHASES}
            phaseLabels={PHASE_LABELS}
            phaseColors={PHASE_COLORS}
            statusLabels={STATUS_LABELS}
            statusColors={STATUS_COLORS}
            pausedStatuses={PAUSED_STATUSES}
          />
        </Suspense>
      )}

      {canImportFromMonday && (
        <Modal
          open={showMondayPicker}
          onClose={handleCloseMondayPicker}
          title="Import from Monday"
          width={720}
          noHeader
          panelClassName={`monday-import-modal monday-import-modal--${mondayPickerStep}`}
          bodyClassName="monday-import-modal__body"
        >
          {showMondayPicker && (
            <Suspense fallback={<div className="empty">Loading Monday import...</div>}>
              <MondayPicker
                onImported={load}
                onClose={handleCloseMondayPicker}
                projectId={projectId}
                projects={projects}
                availableCliTypes={availableCliTypes}
                projectName={projects.find((p) => p.id === selectedProjectId)?.name}
                step={mondayPickerStep}
                onStepChange={setMondayPickerStep}
              />
            </Suspense>
          )}
        </Modal>
      )}

      <CreateTicketModal
        open={showForm}
        creating={creating}
        projectId={projectId}
        projects={projects}
        availableCliTypes={availableCliTypes}
        onClose={closeForm}
        onSubmit={handleCreate}
      />
    </>
  );
}
