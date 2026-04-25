import { memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { CliType, PhaseStatus, Ticket, TicketPhase } from "../../types";

type TicketTagTone = "phase" | "slot" | "status" | "running" | "cli";

interface TicketTagProps {
  icon: string;
  label: string;
  tone: TicketTagTone;
  color: string;
  title?: string;
  running?: boolean;
}

const CLI_TAGS: Record<CliType, { label: string; icon: string; color: string }> = {
  CLAUDE: { label: "Claude", icon: ">_", color: "#6366f1" },
  CODEX: { label: "Codex", icon: ">_", color: "#6366f1" },
};

const PAUSED_STATUS_ICONS: Partial<Record<PhaseStatus, string>> = {
  REQUIRES_ACTION: "!",
  QUESTION: "?",
  ERROR: "x",
};

function TicketTag({ icon, label, tone, color, title, running = false }: TicketTagProps) {
  const accessibleLabel = title ?? label;

  return (
    <span
      className={`phase-badge ticket-tag ticket-tag--${tone}${running ? " ticket-running-badge" : ""}`}
      style={{ background: `${color}22`, color }}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      {running ? (
        <span className="ticket-running-dot ticket-tag-icon" aria-hidden="true" />
      ) : (
        <span className="ticket-tag-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="ticket-tag-label">{label}</span>
    </span>
  );
}

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
  const cliTag = CLI_TAGS[ticket.cliType];

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
          <TicketTag
            icon="P"
            label={phaseLabels[ticket.currentPhase]}
            tone="phase"
            color={phaseColors[ticket.currentPhase]}
            title={`Phase: ${phaseLabels[ticket.currentPhase]}`}
          />
          {ticket.waitingForSlot ? (
            <TicketTag icon="S" label="Waiting for slot" tone="slot" color="#ef4444" title="Waiting for slot" />
          ) : assignedSlotName ? (
            <TicketTag
              icon="S"
              label={assignedSlotName}
              tone="slot"
              color="#0ea5e9"
              title={`Slot: ${assignedSlotName}`}
            />
          ) : null}
          {pausedPhase ? (
            <TicketTag
              icon={PAUSED_STATUS_ICONS[pausedPhase.status] ?? "!"}
              label={statusLabels[pausedPhase.status]}
              tone="status"
              color={statusColors[pausedPhase.status] ?? "#f59e0b"}
              title={`Status: ${statusLabels[pausedPhase.status]}`}
            />
          ) : null}
          {runningPhase ? (
            <TicketTag
              icon="R"
              label={`${phaseLabels[runningPhase.phaseName]} running`}
              tone="running"
              color={runningAccent ?? phaseColors[runningPhase.phaseName]}
              title={`Running phase: ${phaseLabels[runningPhase.phaseName]}`}
              running
            />
          ) : null}
          <TicketTag
            icon={cliTag.icon}
            label={cliTag.label}
            tone="cli"
            color={cliTag.color}
            title={`CLI agent: ${cliTag.label}`}
          />
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
