import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";

const IconRobot = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <path d="M12 11V7" />
    <circle cx="12" cy="5" r="2" />
    <line x1="8" y1="15" x2="8" y2="15" strokeWidth="2.5" />
    <line x1="12" y1="15" x2="12" y2="15" strokeWidth="2.5" />
    <line x1="16" y1="15" x2="16" y2="15" strokeWidth="2.5" />
  </svg>
);
import { extractPullRequestUrl, getPullRequestLinkLabel } from "../../constants/ticket";
import type { PhaseStatus, Ticket, TicketFile, TicketPhase } from "../../types";
import { MarkdownViewer } from "../markdown/MarkdownViewer";
import { SharedMarkdown } from "../markdown/SharedMarkdown";
import { Modal } from "../ui/Modal";
import { Tag } from "../ui/Tag";
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
  selectedPhaseAutoOpenKey: string | undefined;
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
  onCreateFeedback: (ticketId: number, comment: string) => Promise<void>;
  creatingFeedbackTicket: number | null;
  projectName: string | null;
  phaseLabels: Record<TicketPhase, string>;
  phaseColors: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
  statusColors: Record<PhaseStatus, string | null>;
  pausedStatuses: readonly PhaseStatus[];
  phases: readonly TicketPhase[];
  savingContent: boolean;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function normalizeTicketDescriptionImages(description: string, ticketId: number): string {
  return description.replace(/!\[([^\]]*)\]\(([^)\s]*\/\.tribe\/[^)\s]*\/images\/([^)\s]+))\)/g, (_match, alt, _legacyUrl, fileName) => {
    const decodedName = (() => {
      try {
        return decodeURIComponent(fileName);
      } catch {
        return fileName;
      }
    })();
    const normalizedUrl = `/api/uploads/tickets/${ticketId}/images/${encodeURIComponent(decodedName)}`;
    return `![${alt}](${normalizedUrl})`;
  });
}

export function TicketDetailModal({
  ticket,
  open,
  paneWidth = 720,
  viewer,
  selectedPhase,
  selectedPhaseAutoOpenKey,
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
  onCreateFeedback,
  creatingFeedbackTicket,
  projectName,
  phaseLabels,
  phaseColors,
  statusLabels,
  statusColors,
  pausedStatuses,
  phases,
  savingContent,
}: TicketDetailModalProps) {
  const [editingContent, setEditingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const contentForm = useForm<{ title: string; description: string }>({
    defaultValues: {
      title: ticket?.title ?? "",
      description: ticket?.description ?? "",
    },
  });
  const feedbackForm = useForm<{ comment: string }>({
    defaultValues: {
      comment: "",
    },
  });

  useEffect(() => {
    setEditingContent(false);
    contentForm.reset({
      title: ticket?.title ?? "",
      description: ticket?.description ?? "",
    });
    setContentError(null);
    setFeedbackOpen(false);
    feedbackForm.reset({ comment: "" });
    setFeedbackError(null);
  }, [ticket?.id, ticket?.title, ticket?.description, ticket?.waitingForSlot, contentForm, feedbackForm]);

  const draftTitle = contentForm.watch("title");
  const draftDescription = contentForm.watch("description");
  const feedbackDraft = feedbackForm.watch("comment");
  const setDraftTitle = (value: string) => contentForm.setValue("title", value, { shouldDirty: true });
  const setDraftDescription = (value: string) => contentForm.setValue("description", value, { shouldDirty: true });
  const setFeedbackDraft = (value: string) => feedbackForm.setValue("comment", value, { shouldDirty: true });
  const resetContentDraft = () => contentForm.reset({ title: ticket?.title ?? "", description: ticket?.description ?? "" });
  const resetFeedbackDraft = () => feedbackForm.reset({ comment: "" });
  const contentTitleInput = contentForm.register("title", { required: true, maxLength: 255 });
  const contentDescriptionInput = contentForm.register("description");
  const feedbackCommentInput = feedbackForm.register("comment");
  const replyForm = useForm<{ message: string }>({ defaultValues: { message: responseDraft } });
  const { ref: replyRegisterRef, ...replyInput } = replyForm.register("message");
  useEffect(() => {
    replyForm.reset({ message: responseDraft });
  }, [responseDraft, replyForm]);
  const replyMessage = replyForm.watch("message");
  const clearReply = () => {
    replyForm.reset({ message: "" });
    onResponseDraftChange("");
  };
  const replyPanelRef = useRef<HTMLDivElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const paused = ticket?.phases.find(
    (phase) => !!phase.startedAt && !phase.completedAt && pausedStatuses.includes(phase.status),
  );

  useEffect(() => {
    if (!open || !paused || editingContent) return;

    const frame = window.requestAnimationFrame(() => {
      replyPanelRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
      replyTextareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, ticket?.id, paused?.id, paused?.status, editingContent]);

  if (!ticket) return null;

  const canEditContent = ticket.waitingForSlot;
  const feedbackPhases = ticket.phases
    .filter((phase) => phase.phaseName === "FEEDBACK")
    .sort((left, right) => left.sequence - right.sequence || left.id - right.id);
  const feedbackPrUrls = new Set(
    feedbackPhases.flatMap((phase) => (phase.pullRequests ?? []).map((pr) => pr.prUrl)),
  );
  const shipPullRequests = (ticket.pullRequests ?? []).filter((pr) => !feedbackPrUrls.has(pr.prUrl));
  const hasActivePhase = ticket.phases.some((phase) => !!phase.startedAt && !phase.completedAt);
  const hasOpenFeedback = feedbackPhases.some((phase) => !phase.completedAt);
  const assignedArtifacts = ticket.branchName || shipPullRequests.length > 0;
  const canRequestFeedback = ((ticket.pullRequests?.length ?? 0) > 0 || ticket.isDone) && !hasActivePhase && !hasOpenFeedback;
  const feedbackBusy = creatingFeedbackTicket === ticket.id;

  const selectedPhaseRecord = selectedPhase
    ? ticket.phases
        .filter((phase) => phase.phaseName === selectedPhase)
        .sort((left, right) => right.sequence - left.sequence || right.id - left.id)[0] ?? null
    : null;
  const activePhase = ticket.phases.find((p) => !!p.startedAt && !p.completedAt);
  const liveFeedPhase = activePhase ?? ticket.phases.slice().reverse().find((p) => !!p.completedAt) ?? ticket.phases[0];
  const displayedFeedPhaseName = selectedPhase ?? liveFeedPhase?.phaseName;
  const displayedFeedPhaseStatus = (selectedPhase ? selectedPhaseRecord?.status : liveFeedPhase?.status) ?? "PENDING";
  const hasActivityDock = !!activePhase;
  const ticketRunning = ticket.phases.some((phase) => phase.status === "RUNNING");
  const isReplyBusy = respondingTicket === ticket.id;
  const title = viewer?.fileName ? `Ticket #${ticket.id} · ${viewer.fileName}` : `Ticket #${ticket.id} · ${ticket.title}`;
  const trimmedDraftTitle = draftTitle.trim();
  const titleTooLong = trimmedDraftTitle.length > 255;
  const saveDisabled = savingContent || !trimmedDraftTitle || titleTooLong;

  const handleContentSubmit = contentForm.handleSubmit(async ({ title, description }) => {
    const trimmedTitle = title.trim();
    if (savingContent || !trimmedTitle || trimmedTitle.length > 255) return;
    setContentError(null);
    try {
      await onUpdateContent(ticket.id, {
        title: trimmedTitle,
        description: description.trim(),
      });
      setEditingContent(false);
      contentForm.reset({ title: trimmedTitle, description });
    } catch (error: unknown) {
      setContentError(error instanceof Error ? error.message : "Failed to update ticket");
    }
  });

  const handleFeedbackSubmit = feedbackForm.handleSubmit(async ({ comment }) => {
    const trimmedComment = comment.trim();
    if (!trimmedComment || feedbackBusy || !canRequestFeedback) return;
    setFeedbackError(null);
    try {
      await onCreateFeedback(ticket.id, trimmedComment);
      resetFeedbackDraft();
      setFeedbackOpen(false);
    } catch (error: unknown) {
      setFeedbackError(error instanceof Error ? error.message : "Failed to create feedback");
    }
  });

  const handleReplyChange = (value: string) => {
    replyForm.setValue("message", value, { shouldDirty: true });
    onResponseDraftChange(value);
  };

  const handleReplySubmit = () => {
    if (!replyMessage.trim()) return;
    onResponseDraftChange(replyMessage);
    onRespond(ticket.id);
  };

  const fileToPhase = (fileName: string): TicketPhase | null => {
    const base = fileName.replace(/\.md$/, "").toLowerCase();
    if (base === "planning") return "PLANNING";
    if (base === "implementation") return "IMPLEMENTATION";
    if (base === "ship") return "SHIP";
    if (/^feedback-\d+$/.test(base)) return "FEEDBACK";
    if (base === "ticket") return "CREATED";
    return null;
  };

  if (viewer?.fileName) {
    const phaseName = fileToPhase(viewer.fileName);
    const live = phaseName ? liveLogs[`${ticket.id}:${phaseName}`] ?? [] : [];
    return (
      <Modal open={open} onClose={onCloseFile} title={title} variant="right-pane" width={paneWidth} noHeader>
        <div className="td-file-shell">
          <div className="td-topbar td-topbar--file">
            <span className="mono td-topbar__id">#{ticket.id}</span>
            <span className="td-topbar__dot" aria-hidden="true" />
            <span className="td-topbar__project">{viewer.fileName}</span>
            <span style={{ flex: 1 }} />
            <button className="btn-delete td-topbar__close" type="button" onClick={onCloseFile} title="Back to ticket" aria-label="Back to ticket">
              ×
            </button>
          </div>
          <div className="td-file-body">
            <MarkdownViewer ticketId={ticket.id} fileName={viewer.fileName} phaseName={phaseName} liveEvents={live} onBack={onCloseFile} />
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} variant="right-pane" width={paneWidth} noHeader>
      <div className={`td-shell${hasActivityDock ? " td-shell--activity-dock" : ""}`}>
        {/* ── Sticky header ── */}
        <div className="td-topbar">
          <span className="mono td-topbar__id">#{ticket.id}</span>
          {projectName && (
            <>
              <span className="td-topbar__dot" aria-hidden="true" />
              <span className="td-topbar__project">{projectName}</span>
            </>
          )}
          <span style={{ flex: 1 }} />
          {canEditContent && (
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
          )}
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
          <button className="btn-delete td-topbar__close" type="button" onClick={onClose} title="Close" aria-label="Close">
            ×
          </button>
        </div>

        <div className={`td-body${hasActivityDock ? " td-body--with-activity-dock" : ""}`}>
        {/* Title */}
        {editingContent ? (
          <form className="ticket-edit-form" onSubmit={handleContentSubmit}>
            <input
              className="input"
              maxLength={255}
              required
              autoFocus
              {...contentTitleInput}
            />
            <textarea
              className="input textarea"
              rows={4}
              {...contentDescriptionInput}
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
                  resetContentDraft();
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
        ) : (
          <h1 className="serif td-title">{ticket.title}</h1>
        )}

        {/* Meta tags row */}
        <div className="td-meta-row">
          <Tag color={phaseColors[ticket.currentPhase]} dot>
            {phaseLabels[ticket.currentPhase]}
          </Tag>
          <Tag color="var(--ink-2)" icon={<IconRobot />}>
            {ticket.cliType === "CODEX" ? "Codex" : "Claude"}
          </Tag>
          {ticket.waitingForSlot ? (
            <Tag color="var(--status-warn)">Waiting for slot</Tag>
          ) : assignedSlotName ? (
            <Tag color="var(--ink-3)">{assignedSlotName}</Tag>
          ) : null}
          <Tag color="var(--ink-4)">Created {relativeTime(ticket.createdAt)}</Tag>
        </div>

        {/* Description */}
        {!editingContent && ticket.description ? (
          <div className="ticket-desc serif" style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-1)", marginBottom: 20 }}>
            <SharedMarkdown content={normalizeTicketDescriptionImages(ticket.description, ticket.id)} />
          </div>
        ) : null}

        {/* ── Lifecycle ── */}
        {ticket.phases.length > 0 ? (
          <div className="td-section">
            <div className="td-section-label">Lifecycle</div>
            <div className="td-lifecycle">
              {phases.map((phase) => {
                const phaseRecord = ticket.phases.find((item) => item.phaseName === phase);
                const isCompleted = !!phaseRecord?.completedAt;
                const isActive = !!phaseRecord?.startedAt && !phaseRecord?.completedAt;
                const status = phaseRecord?.status ?? "PENDING";
                const isPaused = isActive && (status === "REQUIRES_ACTION" || status === "QUESTION" || status === "ERROR");
                const isRunning = isActive && status === "RUNNING";
                const phaseColor = phaseColors[phase];
                const statusColor = statusColors[status];
                const accent = isPaused ? (statusColor ?? "var(--status-warn)") : phaseColor;
                const isBusy = triggeringPhase === `${ticket.id}:${phase}`;
                const isSelected = selectedPhase === phase;
                const stateLabel = isCompleted ? "Completed" : isRunning ? "Running…" : isPaused ? (statusLabels[status] ?? "Paused") : isActive ? "Active" : "Pending";

                return (
                  <div
                    key={phase}
                    role="button"
                    tabIndex={0}
                    className={`td-lc-card${isSelected ? " td-lc-card--selected" : ""}`}
                    style={{
                      borderColor: (isActive || isPaused || isCompleted)
                        ? `color-mix(in srgb, ${accent} 30%, var(--hairline))`
                        : undefined,
                      boxShadow: isRunning ? `0 0 0 2px color-mix(in srgb, ${accent} 25%, transparent)` : undefined,
                    }}
                    onClick={() => onSelectPhase(ticket.id, phase)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectPhase(ticket.id, phase);
                      }
                    }}
                  >
                    <div className="td-lc-card__head">
                      <span
                        className="td-lc-card__circle"
                        style={{
                          background: isCompleted ? accent : "transparent",
                          borderColor: isCompleted ? accent : `color-mix(in srgb, ${accent} 50%, var(--hairline-strong))`,
                        }}
                      >
                        {isCompleted && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                            <path d="M2 5l2.5 2.5L8 3" stroke="var(--cream)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {isRunning && <span className="td-lc-card__pulse" style={{ background: accent }} />}
                        {isPaused && (
                          <span style={{ fontSize: 9, color: accent, fontWeight: 700, lineHeight: 1 }}>
                            {status === "QUESTION" ? "?" : "!"}
                          </span>
                        )}
                      </span>
                      <span className="td-lc-card__name">{phaseLabels[phase]}</span>
                    </div>
                    <div className="td-lc-card__status" style={{ color: (isActive || isPaused) ? accent : undefined }}>
                      {stateLabel}
                    </div>
                    <button
                      className="td-lc-card__trigger"
                      type="button"
                      disabled={isBusy || ticketRunning}
                      onClick={(event) => {
                        event.stopPropagation();
                        onTriggerPhase(ticket.id, phase);
                      }}
                      title={ticketRunning ? "A phase is already running" : `Trigger ${phaseLabels[phase]}`}
                    >
                      {isBusy ? "…" : "Trigger"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Generated files ── */}
        {(filesLoading || files.length > 0) && (
          <div className="td-section">
            <div className="td-section-label">Generated files</div>
            {filesLoading ? (
              <div style={{ fontSize: 11, color: "var(--ink-4)" }}>Loading files…</div>
            ) : (
              <div className="file-chips">
                {files.map((file) => (
                  <button
                    key={file.name}
                    className="file-chip"
                    type="button"
                    onClick={() => onOpenFile(file.name)}
                    title={`${file.size} bytes · ${new Date(file.mtime).toLocaleString()}`}
                  >
                    <span className="mono file-chip-icon" style={{ fontSize: 11, color: "var(--ink-4)" }}>{"{}"}</span>
                    {file.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Ship artifacts ── */}
        {(assignedArtifacts || ticket.isDone) ? (
          <div className="td-section">
            <div className="td-section-header">
              <div className="td-section-label">Ship artifacts</div>
              <button
                className="td-feedback-button"
                type="button"
                disabled={!canRequestFeedback || feedbackBusy}
                onClick={() => {
                  setFeedbackOpen((prev) => {
                    const next = !prev;
                    if (!next) resetFeedbackDraft();
                    return next;
                  });
                  setFeedbackError(null);
                }}
                title={hasOpenFeedback ? "Finish the open feedback round first" : "Add feedback"}
              >
                {feedbackOpen ? "Cancel" : "Add feedback"}
              </button>
            </div>
            {assignedArtifacts ? (
              <div className="td-artifacts-card">
                {ticket.branchName ? (
                  <div className="td-artifacts-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                    <code className="mono" style={{ fontSize: 12.5, color: "var(--ink-1)" }}>{ticket.branchName}</code>
                  </div>
                ) : null}
                {shipPullRequests.map((pr) => {
                  const url = extractPullRequestUrl(pr.prUrl);
                  return (
                    <div key={`${pr.repo}-${pr.prUrl}`} className="td-artifacts-row">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="18" cy="18" r="3" />
                        <circle cx="6" cy="6" r="3" />
                        <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                        <line x1="6" y1="9" x2="6" y2="21" />
                      </svg>
                      <span className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>{pr.repo}</span>
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--claude-deep)", textDecoration: "none", fontWeight: 500 }}>
                          {getPullRequestLinkLabel(url)}
                        </a>
                      ) : (
                        <span>{pr.prUrl}</span>
                      )}
                      <code className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: "auto" }}>{pr.commitSha}</code>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {feedbackOpen ? (
              <form className="td-feedback-form" onSubmit={handleFeedbackSubmit}>
                <textarea
                  className="input textarea"
                  rows={3}
                  placeholder="Describe the follow-up change…"
                  {...feedbackCommentInput}
                />
                {feedbackError ? <div className="ticket-edit-error">{feedbackError}</div> : null}
                <div className="td-feedback-form__actions">
                  <button
                    className="btn"
                    type="button"
                    disabled={feedbackBusy}
                    onClick={() => {
                      setFeedbackOpen(false);
                      resetFeedbackDraft();
                      setFeedbackError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={feedbackBusy || !feedbackDraft.trim() || !canRequestFeedback}
                  >
                    {feedbackBusy ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}

        {/* ── Feedback rounds ── */}
        {feedbackPhases.length > 0 ? (
          <div className="td-section">
            <div className="td-section-label">Feedback</div>
            <div className="td-feedback-list">
              {feedbackPhases.map((phase) => {
                const isActivePausedFeedback = paused?.id === phase.id;
                const color = statusColors[phase.status] ?? phaseColors.FEEDBACK;
                return (
                  <div key={phase.id} className="td-feedback-card">
                    <div className="td-feedback-card__head">
                      <span className="td-feedback-card__title">Round {phase.sequence}</span>
                      <Tag color={color} dot>{statusLabels[phase.status]}</Tag>
                    </div>
                    {phase.feedbackComment ? (
                      <div className="td-feedback-card__comment serif">{phase.feedbackComment}</div>
                    ) : null}
                    {phase.branchName ? (
                      <div className="td-artifacts-row">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="6" y1="3" x2="6" y2="15" />
                          <circle cx="18" cy="6" r="3" />
                          <circle cx="6" cy="18" r="3" />
                          <path d="M18 9a9 9 0 0 1-9 9" />
                        </svg>
                        <code className="mono" style={{ fontSize: 12.5, color: "var(--ink-1)" }}>{phase.branchName}</code>
                      </div>
                    ) : null}
                    {phase.pullRequests?.map((pr) => {
                      const url = extractPullRequestUrl(pr.prUrl);
                      return (
                        <div key={`${phase.id}-${pr.repo}-${pr.prUrl}`} className="td-artifacts-row">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="18" cy="18" r="3" />
                            <circle cx="6" cy="6" r="3" />
                            <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                            <line x1="6" y1="9" x2="6" y2="21" />
                          </svg>
                          <span className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>{pr.repo}</span>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--claude-deep)", textDecoration: "none", fontWeight: 500 }}>
                              {getPullRequestLinkLabel(url)}
                            </a>
                          ) : (
                            <span>{pr.prUrl}</span>
                          )}
                          <code className="mono" style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: "auto" }}>{pr.commitSha}</code>
                        </div>
                      );
                    })}
                    {isActivePausedFeedback ? (
                      <div ref={replyPanelRef} className="td-feedback-reply">
                        {phase.lastMessage ? (
                          <div className="serif td-paused-panel__message">{phase.lastMessage}</div>
                        ) : null}
                        <textarea
                          ref={(node) => {
                            replyRegisterRef(node);
                            replyTextareaRef.current = node;
                          }}
                          className="input textarea td-paused-panel__textarea"
                          rows={3}
                          placeholder="Reply to the feedback agent…"
                          {...replyInput}
                          value={replyMessage}
                          onChange={(event) => handleReplyChange(event.target.value)}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                          <button
                            className="btn btn-secondary"
                            type="button"
                            onClick={clearReply}
                          >
                            Discard
                          </button>
                          <button
                            className="btn btn-primary"
                            type="button"
                            disabled={isReplyBusy || !replyMessage.trim()}
                            onClick={handleReplySubmit}
                          >
                            {isReplyBusy ? "Sending…" : "Send reply"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Live feed ── */}
        {displayedFeedPhaseName ? (
          <div className={`td-section td-activity-section${hasActivityDock ? " td-activity-section--docked" : ""}`}>
            <div className="td-section-label">
              Live feed · {phaseLabels[displayedFeedPhaseName] ?? displayedFeedPhaseName}
            </div>
            <PhaseLiveFeed
              ticketId={ticket.id}
              phaseName={displayedFeedPhaseName}
              status={displayedFeedPhaseStatus}
              liveEvents={liveLogs[`${ticket.id}:${displayedFeedPhaseName}`] ?? []}
              autoOpenKey={selectedPhaseAutoOpenKey}
              fill={hasActivityDock}
            />
          </div>
        ) : null}

        {/* ── Paused / reply panel ── */}
        {paused && paused.phaseName !== "FEEDBACK" ? (
          <div
            ref={replyPanelRef}
            className={`td-paused-panel${hasActivityDock ? " td-paused-panel--sticky" : ""}`}
            style={{
              background: paused.status === "ERROR"
                ? "color-mix(in srgb, var(--status-error) 8%, var(--cream))"
                : "color-mix(in srgb, var(--status-warn) 9%, var(--cream))",
              borderColor: `color-mix(in srgb, ${statusColors[paused.status] ?? "var(--status-warn)"} 35%, transparent)`,
            }}
          >
            <div
              className="td-paused-panel__label"
              style={{ color: statusColors[paused.status] ?? "var(--status-warn)" }}
            >
              {phaseLabels[paused.phaseName]} — {statusLabels[paused.status]}
            </div>
            {paused.lastMessage ? (
              <div className="serif td-paused-panel__message">{paused.lastMessage}</div>
            ) : null}
            <textarea
              ref={(node) => {
                replyRegisterRef(node);
                replyTextareaRef.current = node;
              }}
              className="input textarea td-paused-panel__textarea"
              rows={3}
              placeholder="Reply to the agent…"
              {...replyInput}
              value={replyMessage}
              onChange={(event) => handleReplyChange(event.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => onResponseDraftChange("")}
              >
                Discard
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={isReplyBusy || !responseDraft.trim()}
                onClick={() => onRespond(ticket.id)}
              >
                {isReplyBusy ? "Sending…" : "Send reply"}
              </button>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </Modal>
  );
}
