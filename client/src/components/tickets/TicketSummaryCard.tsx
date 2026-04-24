import { memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { PhaseStatus, Ticket, TicketPhase } from "../../types";

const extractUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const markdownMatch = trimmed.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1];
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
};

const getPrLinkLabel = (url: string): string => {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    const number = path.match(/\/pull\/(\d+)$/)?.[1];
    if (number) return `PR #${number}`;
  } catch {
    // fall through
  }
  return "Open PR";
};

interface TicketSummaryCardProps {
  ticket: Ticket;
  assignedSlotName: string | null;
  onOpen: () => void;
  phaseLabels: Record<TicketPhase, string>;
  phaseColors: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
  statusColors: Record<PhaseStatus, string | null>;
  pausedStatuses: readonly PhaseStatus[];
}

export const TicketSummaryCard = memo(function TicketSummaryCard({
  ticket,
  assignedSlotName,
  onOpen,
  phaseLabels,
  phaseColors,
  statusLabels,
  statusColors,
  pausedStatuses,
}: TicketSummaryCardProps) {
  const pausedPhase = ticket.phases.find(
    (phase) => !!phase.startedAt && !phase.completedAt && pausedStatuses.includes(phase.status),
  );
  const runningPhase = ticket.phases.find(
    (phase) => !!phase.startedAt && !phase.completedAt && phase.status === "RUNNING",
  );
  const runningAccent = runningPhase ? statusColors[runningPhase.status] ?? phaseColors[runningPhase.phaseName] : null;

  const createdAt = new Date(ticket.createdAt).toLocaleDateString();
  const pullRequestCount = ticket.pullRequests?.length ?? 0;
  const hasPullRequests = pullRequestCount > 0;
  const resolvedPullRequests = (ticket.pullRequests ?? []).flatMap((pullRequest) => {
    const url = extractUrl(pullRequest.prUrl);
    return url ? [{ ...pullRequest, url }] : [];
  });
  const primaryPullRequest = resolvedPullRequests[0] ?? null;
  const extraPullRequestCount = Math.max(resolvedPullRequests.length - 1, 0);
  const fallbackHint = ticket.branchName
    ? `Branch ${ticket.branchName}`
    : hasPullRequests
      ? `${pullRequestCount} PR${pullRequestCount === 1 ? "" : "s"}`
      : "Open for details";
  const descriptionPreview = ticket.description?.trim() ?? "";
  const hasDescriptionPreview = descriptionPreview.length > 0;

  const clickableCardStyle: CSSProperties = {
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
    padding: "0.85rem 1rem",
    gap: "0.6rem",
  };

  const footerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen();
  };

  const stopCardOpen = (event: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`ticket-card ticket-card--interactive${runningPhase ? " ticket-card--running" : ""}`}
      style={{
        ...clickableCardStyle,
        ...(runningAccent ? ({ "--ticket-running-accent": runningAccent } as CSSProperties) : {}),
      }}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      aria-label={`Open ticket #${ticket.id}: ${ticket.title}`}
    >
      <div className="ticket-header">
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
          {ticket.waitingForSlot ? (
            <span className="phase-badge" style={{ background: "#ef444422", color: "#ef4444" }}>
              Waiting for slot
            </span>
          ) : assignedSlotName ? (
            <span className="phase-badge" style={{ background: "#0ea5e922", color: "#0ea5e9" }}>
              {assignedSlotName}
            </span>
          ) : null}
          {pausedPhase ? (
            <span
              className="phase-badge"
              style={{
                background: `${statusColors[pausedPhase.status] ?? "#f59e0b"}22`,
                color: statusColors[pausedPhase.status] ?? "#f59e0b",
              }}
            >
              {statusLabels[pausedPhase.status]}
            </span>
          ) : null}
          {runningPhase ? (
            <span
              className="phase-badge ticket-running-badge"
              style={{
                background: `${runningAccent ?? phaseColors[runningPhase.phaseName]}22`,
                color: runningAccent ?? phaseColors[runningPhase.phaseName],
              }}
            >
              <span className="ticket-running-dot" aria-hidden="true" />
              <span>{phaseLabels[runningPhase.phaseName]} running</span>
            </span>
          ) : null}
        </div>
        <span className="ticket-date">{createdAt}</span>
      </div>

      <h3 className="ticket-title" style={{ margin: 0 }}>
        {ticket.title}
      </h3>

      {hasDescriptionPreview ? <p className="ticket-card-description">{descriptionPreview}</p> : null}

      <div className="ticket-footer" style={footerStyle}>
        {primaryPullRequest ? (
          <span className="ticket-card-footer-meta">
            <a
              className="ticket-card-pr-link"
              href={primaryPullRequest.url}
              target="_blank"
              rel="noreferrer"
              onClick={stopCardOpen}
              onKeyDown={stopCardOpen}
            >
              {getPrLinkLabel(primaryPullRequest.url)}
            </a>
            {extraPullRequestCount > 0 ? <span className="ticket-card-pr-extra">+{extraPullRequestCount}</span> : null}
          </span>
        ) : (
          <span className="ticket-date ticket-card-footer-hint">{fallbackHint}</span>
        )}
        <span className="ticket-date ticket-card-footer-action">View details</span>
      </div>
    </div>
  );
});
