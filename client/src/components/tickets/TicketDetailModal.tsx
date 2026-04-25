import { type CSSProperties, type FormEvent, useEffect, useState, useRef } from "react";
import { uploadTicketImage } from "../../api";
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
  onUpdateContent: (ticketId: number, patch: { title: string; description: string }) => Promise<void>;
  onTriggerPhase: (ticketId: number, phase: TicketPhase) => void;
  onSelectPhase: (ticketId: number, phase: TicketPhase) => void;
  onOpenFile: (fileName: string) => void;
  onCloseFile: () => void;
  onResponseDraftChange: (value: string) => void;
  onRespond: (ticketId: number) => void;
  onImageUploaded?: () => void;
  phaseLabels: Record<TicketPhase, string>;
  phaseColors: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
  statusColors: Record<PhaseStatus, string | null>;
  pausedStatuses: readonly PhaseStatus[];
  phases: readonly TicketPhase[];
  savingContent: boolean;
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
  onUpdateContent,
  onTriggerPhase,
  onSelectPhase,
  onOpenFile,
  onCloseFile,
  onResponseDraftChange,
  onRespond,
  onImageUploaded,
  phaseLabels,
  phaseColors,
  statusLabels,
  statusColors,
  pausedStatuses,
  phases,
  savingContent,
}: TicketDetailModalProps) {
  const [editingContent, setEditingContent] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    setEditingContent(false);
    setDraftTitle(ticket?.title ?? "");
    setDraftDescription(ticket?.description ?? "");
    setContentError(null);
  }, [ticket?.id, ticket?.title, ticket?.description, ticket?.waitingForSlot]);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);

  if (!ticket) return null;

  const canEditContent = ticket.waitingForSlot;
  const assignedArtifacts = ticket.branchName || (ticket.pullRequests?.length ?? 0) > 0;

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgUploading(true);
    setImgError(null);
    try {
      await uploadTicketImage(ticket.id, file);
      onImageUploaded?.();
    } catch (err: any) {
      setImgError(err.message);
    } finally {
      setImgUploading(false);
      if (imgInputRef.current) imgInputRef.current.value = "";
    }
  };
  const paused = ticket.phases.find(
    (phase) => !!phase.startedAt && !phase.completedAt && pausedStatuses.includes(phase.status),
  );
  const selectedPhaseRecord = selectedPhase ? ticket.phases.find((phase) => phase.phaseName === selectedPhase) : null;
  const ticketRunning = ticket.phases.some((phase) => phase.status === "RUNNING");
  const isReplyBusy = respondingTicket === ticket.id;
  const title = viewer?.fileName ? `Ticket #${ticket.id} · ${viewer.fileName}` : `Ticket #${ticket.id} · ${ticket.title}`;
  const trimmedDraftTitle = draftTitle.trim();
  const titleTooLong = trimmedDraftTitle.length > 255;
  const saveDisabled = savingContent || !trimmedDraftTitle || titleTooLong;

  const handleContentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveDisabled) return;
    setContentError(null);
    try {
      await onUpdateContent(ticket.id, {
        title: trimmedDraftTitle,
        description: draftDescription.trim(),
      });
      setEditingContent(false);
    } catch (error: unknown) {
      setContentError(error instanceof Error ? error.message : "Failed to update ticket");
    }
  };

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
      <div className="ticket-header" style={{ marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
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
        <div className="ticket-detail-actions">
          {canEditContent ? (
            <button
              className="ticket-action-button"
              type="button"
              onClick={() => {
                if (editingContent) {
                  setDraftTitle(ticket.title);
                  setDraftDescription(ticket.description ?? "");
                }
                setEditingContent((prev) => !prev);
                setContentError(null);
              }}
              disabled={savingContent}
            >
              {editingContent ? "Cancel" : "Edit"}
            </button>
          ) : null}
          <button
            className="ticket-remove-button"
            type="button"
            onClick={() => onDelete(ticket.id)}
            title="Remove ticket"
          >
            <svg
              className="ticket-remove-button__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M8 6V4.75C8 4.336 8.336 4 8.75 4h6.5c.414 0 .75.336.75.75V6" />
              <path d="M6.75 6l.6 11.3A2 2 0 0 0 9.347 19.2h5.306a2 2 0 0 0 1.997-1.9L17.25 6" />
              <path d="M10 10.25v5.5" />
              <path d="M14 10.25v5.5" />
            </svg>
            <span>Remove</span>
          </button>
        </div>
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

      {editingContent ? (
        <form className="ticket-edit-form" onSubmit={handleContentSubmit}>
          <input
            className="input"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            maxLength={255}
            required
            autoFocus
          />
          <textarea
            className="input textarea"
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            rows={4}
          />
          {contentError ? <div className="ticket-edit-error">{contentError}</div> : null}
          {titleTooLong ? <div className="ticket-edit-error">Title must be 255 characters or fewer.</div> : null}
          <div className="ticket-edit-actions">
            <button
              className="btn"
              type="button"
              disabled={savingContent}
              onClick={() => {
                setEditingContent(false);
                setDraftTitle(ticket.title);
                setDraftDescription(ticket.description ?? "");
                setContentError(null);
              }}
            >
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={saveDisabled}>
              {savingContent ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : ticket.description ? (
        <p className="ticket-desc">{ticket.description}</p>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <input
          ref={imgInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.webp"
          style={{ display: "none" }}
          onChange={handleImageChange}
        />
        <button
          className="btn"
          type="button"
          style={{ fontSize: 11, padding: "3px 8px" }}
          disabled={imgUploading}
          onClick={() => imgInputRef.current?.click()}
        >
          {imgUploading ? "Uploading..." : "Upload Image"}
        </button>
        {imgError && <span style={{ fontSize: 11, color: "#ef4444", marginLeft: 8 }}>{imgError}</span>}
      </div>

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
