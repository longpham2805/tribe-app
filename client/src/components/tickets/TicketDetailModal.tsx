import type { CSSProperties } from "react";
import { extractPullRequestUrl, getPullRequestLinkLabel } from "../../constants/ticket";
import type { PhaseStatus, Ticket, TicketFile, TicketPhase } from "../../types";
import { MarkdownViewer } from "../markdown/MarkdownViewer";
import { Modal } from "../ui/Modal";
import { PhaseLiveFeed } from "./PhaseLiveFeed";

interface TicketViewerState {
  fileName: string | null;
}

interface TicketDetailModalProps {
  ticket: Ticket | null;
  open: boolean;
  paneWidth?: number;
  viewer: TicketViewerState | null;
  selectedPhase: TicketPhase | undefined;
  liveLogs: Record<string, any[]>;
  files: TicketFile[];
  filesLoading: boolean;
  assignedSlotName: string | null;
  triggeringPhase: string | null;
  respondingTicket: number | null;
  responseDraft: string;
  onClose: () => void;
  onDelete: (ticketId: number) => void;
  onTriggerPhase: (ticketId: number, phase: TicketPhase) => void;
  onSelectPhase: (ticketId: number, phase: TicketPhase) => void;
  onOpenFile: (fileName: string) => void;
  onCloseFile: () => void;
  onResponseDraftChange: (value: string) => void;
  onRespond: (ticketId: number) => void;
  phaseLabels: Record<TicketPhase, string>;
  phaseColors: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
  statusColors: Record<PhaseStatus, string | null>;
  pausedStatuses: readonly PhaseStatus[];
  phases: readonly TicketPhase[];
}

export function TicketDetailModal({
  ticket,
  open,
  paneWidth = 720,
  viewer,
  selectedPhase,
  liveLogs,
  files,
  filesLoading,
  assignedSlotName,
  triggeringPhase,
  respondingTicket,
  responseDraft,
  onClose,
  onDelete,
  onTriggerPhase,
  onSelectPhase,
  onOpenFile,
  onCloseFile,
  onResponseDraftChange,
  onRespond,
  phaseLabels,
  phaseColors,
  statusLabels,
  statusColors,
  pausedStatuses,
  phases,
}: TicketDetailModalProps) {
  if (!ticket) return null;

  const assignedArtifacts = ticket.branchName || (ticket.pullRequests?.length ?? 0) > 0;
  const paused = ticket.phases.find(
    (phase) => !!phase.startedAt && !phase.completedAt && pausedStatuses.includes(phase.status),
  );
  const selectedPhaseRecord = selectedPhase ? ticket.phases.find((phase) => phase.phaseName === selectedPhase) : null;
  const ticketRunning = ticket.phases.some((phase) => phase.status === "RUNNING");
  const isReplyBusy = respondingTicket === ticket.id;
  const title = viewer?.fileName ? `Ticket #${ticket.id} · ${viewer.fileName}` : `Ticket #${ticket.id} · ${ticket.title}`;

  const fileToPhase = (fileName: string): TicketPhase | null => {
    const base = fileName.replace(/\.md$/, "").toLowerCase();
    if (base === "planning") return "PLANNING";
    if (base === "implementation") return "IMPLEMENTATION";
    if (base === "ship") return "SHIP";
    if (base === "ticket") return "CREATED";
    return null;
  };

  if (viewer?.fileName) {
    const phaseName = fileToPhase(viewer.fileName);
    const live = phaseName ? liveLogs[`${ticket.id}:${phaseName}`] ?? [] : [];
    return (
      <Modal open={open} onClose={onCloseFile} title={title} variant="right-pane" width={paneWidth}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <button className="btn" type="button" onClick={onCloseFile}>
            ← Back to ticket
          </button>
        </div>
        <MarkdownViewer ticketId={ticket.id} fileName={viewer.fileName} phaseName={phaseName} liveEvents={live} />
      </Modal>
    );
  }

  const metaRowStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
    alignItems: "center",
  };

  return (
    <Modal open={open} onClose={onClose} title={title} variant="right-pane" width={paneWidth}>
      <div className="ticket-header" style={{ marginBottom: 10 }}>
        <div className="ticket-meta" style={{ flexWrap: "wrap" }}>
          <span className="ticket-id">#{ticket.id}</span>
          <span
            className="phase-badge"
            style={{
              background: `${phaseColors[ticket.currentPhase]}22`,
              color: phaseColors[ticket.currentPhase],
            }}
          >
            {phaseLabels[ticket.currentPhase]}
          </span>
          <span
            className="phase-badge"
            style={{ background: "#6366f122", color: "#6366f1" }}
            title="CLI agent"
          >
            {ticket.cliType === "CODEX" ? "Codex" : "Claude"}
          </span>
        </div>
        <button className="btn-delete" type="button" onClick={() => onDelete(ticket.id)} title="Delete">
          ×
        </button>
      </div>

      <div style={metaRowStyle}>
        <span className="ticket-date">Created {new Date(ticket.createdAt).toLocaleDateString()}</span>
        {ticket.waitingForSlot ? (
          <span className="phase-badge" style={{ background: "#ef444422", color: "#ef4444" }}>
            Waiting for slot
          </span>
        ) : assignedSlotName ? (
          <span className="phase-badge" style={{ background: "#0ea5e922", color: "#0ea5e9" }}>
            {assignedSlotName}
          </span>
        ) : null}
      </div>

      {ticket.description ? <p className="ticket-desc">{ticket.description}</p> : null}

      {assignedArtifacts ? (
        <div className="ship-artifacts card">
          <div className="ship-artifacts-title">Ship Artifacts</div>
          {ticket.branchName ? (
            <div className="ship-artifacts-branch">
              Branch: <code>{ticket.branchName}</code>
            </div>
          ) : null}
          {ticket.pullRequests?.length ? (
            <table className="ship-artifacts-table" aria-label={`Ticket ${ticket.id} pull requests`}>
              <thead>
                <tr>
                  <th>Repo</th>
                  <th>PR Link</th>
                  <th>Commit</th>
                </tr>
              </thead>
              <tbody>
                {ticket.pullRequests.map((pr) => (
                  <tr key={`${pr.repo}-${pr.prUrl}`}>
                    <td>{pr.repo}</td>
                    <td>
                      {(() => {
                        const url = extractPullRequestUrl(pr.prUrl);
                        if (!url) return <span>{pr.prUrl}</span>;
                        return (
                          <a href={url} target="_blank" rel="noreferrer">
                            {getPullRequestLinkLabel(url)}
                          </a>
                        );
                      })()}
                    </td>
                    <td>
                      <code>{pr.commitSha}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}

      {ticket.phases.length > 0 ? (
        <div className="phase-pipeline">
          {phases.map((phase) => {
            const phaseRecord = ticket.phases.find((item) => item.phaseName === phase);
            const isCompleted = !!phaseRecord?.completedAt;
            const isActive = !!phaseRecord?.startedAt && !phaseRecord?.completedAt;
            const isPending = !phaseRecord?.startedAt;
            const status = phaseRecord?.status ?? "PENDING";
            const phaseColor = phaseColors[phase];
            const statusColor = statusColors[status];
            const accent = statusColor ?? phaseColor;
            const isBusy = triggeringPhase === `${ticket.id}:${phase}`;
            const isRunning = isActive && status === "RUNNING";
            const isSelected = selectedPhase === phase;
            const stateLabel = isCompleted ? "Completed" : isPending ? "Pending" : statusLabels[status] ?? "Active";
            const icon = isCompleted
              ? "✓"
              : status === "ERROR"
                ? "!"
                : status === "REQUIRES_ACTION" || status === "QUESTION"
                  ? "?"
                  : isActive
                    ? "●"
                    : "○";

            return (
              <div
                key={phase}
                role="button"
                tabIndex={0}
                className={`phase-card ${isActive ? "phase-card--active" : ""} ${isCompleted ? "phase-card--completed" : ""} ${isPending ? "phase-card--pending" : ""} ${isRunning ? "phase-card--running" : ""} ${isSelected ? "phase-card--selected" : ""}`}
                style={{
                  cursor: "pointer",
                  "--selection-accent": phaseColor,
                  ...(isRunning
                    ? ({ "--running-accent": accent } as CSSProperties)
                    : isActive
                      ? { borderColor: accent }
                      : isCompleted
                        ? { borderColor: `${phaseColor}55` }
                        : {}),
                } as CSSProperties}
                onClick={() => onSelectPhase(ticket.id, phase)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectPhase(ticket.id, phase);
                  }
                }}
              >
                <div
                  className="phase-card-header"
                  style={isActive ? { color: accent } : isCompleted ? { color: phaseColor } : {}}
                >
                  <span className={`phase-card-icon${isRunning ? " phase-card-icon--running" : ""}`}>{icon}</span>
                  <span className="phase-card-name">{phaseLabels[phase]}</span>
                </div>
                <div className="phase-card-status" style={isActive && statusColor ? { color: statusColor } : {}}>
                  {stateLabel}
                </div>
                <button
                  className="phase-card-trigger"
                  type="button"
                  style={isActive ? { borderColor: `${accent}66`, color: accent } : {}}
                  disabled={isBusy || ticketRunning}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTriggerPhase(ticket.id, phase);
                  }}
                  title={ticketRunning ? "A phase is already running" : `Trigger ${phaseLabels[phase]}`}
                >
                  {isBusy ? "..." : "Trigger"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {selectedPhase ? (
        <PhaseLiveFeed
          ticketId={ticket.id}
          phaseName={selectedPhase}
          status={selectedPhaseRecord?.status ?? "PENDING"}
          liveEvents={liveLogs[`${ticket.id}:${selectedPhase}`] ?? []}
        />
      ) : null}

      {filesLoading ? (
        <div style={{ marginTop: 10, fontSize: 11, color: "#64748b" }}>Loading files…</div>
      ) : files.length > 0 ? (
        <div className="file-chips">
          {files.map((file) => (
            <button
              key={file.name}
              className="file-chip"
              type="button"
              onClick={() => onOpenFile(file.name)}
              title={`${file.size} bytes · ${new Date(file.mtime).toLocaleString()}`}
            >
              <span className="file-chip-icon">📄</span>
              {file.name}
            </button>
          ))}
        </div>
      ) : null}

      {paused ? (
        <div className="phase-paused" style={{ borderColor: `${statusColors[paused.status] ?? "#f59e0b"}66` }}>
          <div className="phase-paused-header" style={{ color: statusColors[paused.status] ?? "#f59e0b" }}>
            {phaseLabels[paused.phaseName]} — {statusLabels[paused.status]}
          </div>
          {paused.lastMessage ? <div className="phase-paused-message">{paused.lastMessage}</div> : null}
          <textarea
            className="input textarea"
            rows={3}
            placeholder="Reply to the agent..."
            value={responseDraft}
            onChange={(event) => onResponseDraftChange(event.target.value)}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn btn-primary"
              type="button"
              disabled={isReplyBusy || !responseDraft.trim()}
              onClick={() => onRespond(ticket.id)}
            >
              {isReplyBusy ? "Sending..." : "Send reply"}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
