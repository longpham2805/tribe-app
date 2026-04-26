import { memo, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { PHASES } from "../../constants/ticket";
import type { CliType, PhaseStatus, Ticket, TicketPhase } from "../../types";

interface TicketSummaryCardProps {
  ticket: Ticket;
  assignedSlotName: string | null;
  projectName: string | null;
  onOpen: () => void;
  phaseLabels: Record<TicketPhase, string>;
  phaseColors: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
  statusColors: Record<PhaseStatus, string | null>;
  pausedStatuses: readonly PhaseStatus[];
}

const CLI_LABELS: Record<CliType, string> = { CLAUDE: "Claude", CODEX: "Codex" };

const PAUSED_STATUS_LABELS: Partial<Record<PhaseStatus, string>> = {
  REQUIRES_ACTION: "Needs input",
  QUESTION: "Question",
  ERROR: "Error",
};

function Tag({
  children,
  color,
  dot,
  icon,
}: {
  children: React.ReactNode;
  color: string;
  dot?: boolean;
  icon?: React.ReactNode;
}) {
  const bg = color.startsWith("var(")
    ? `color-mix(in srgb, ${color} 12%, transparent)`
    : `${color}22`;
  return (
    <span className="sc-tag" style={{ background: bg, color }}>
      {dot && <span className="sc-tag__dot" style={{ background: color }} />}
      {icon && <span className="sc-tag__icon" aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

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

const IconMonitor = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const IconBranch = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

function PipelineBars({
  ticket,
  phaseColors,
  statusColors,
  pausedStatuses,
  phaseLabels,
  statusLabels,
}: {
  ticket: Ticket;
  phaseColors: Record<TicketPhase, string>;
  statusColors: Record<PhaseStatus, string | null>;
  pausedStatuses: readonly PhaseStatus[];
  phaseLabels: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
}) {
  return (
    <div className="sc-pipeline">
      {PHASES.map((p) => {
        const rec = ticket.phases.find((x) => x.phaseName === p);
        const completed = !!rec?.completedAt;
        const active = !!rec?.startedAt && !rec?.completedAt;
        const status = rec?.status ?? "PENDING";
        const isPaused = active && pausedStatuses.includes(status);
        const isRunning = active && status === "RUNNING";
        const accent = isPaused
          ? (statusColors[status] ?? "#B07634")
          : phaseColors[p];

        const barStyle: CSSProperties = {
          background: completed
            ? accent
            : `color-mix(in srgb, ${accent} 14%, transparent)`,
          borderColor: completed || active ? accent : "var(--hairline)",
        };

        const statusLabel = completed
          ? "Done"
          : isRunning
            ? "Running…"
            : isPaused
              ? (PAUSED_STATUS_LABELS[status] ?? statusLabels[status])
              : "Pending";

        return (
          <div key={p} className="sc-pipeline__col">
            <div className="sc-pipeline__bar" style={barStyle}>
              {isRunning && <span className="sc-pipeline__shimmer" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />}
            </div>
            <div className="sc-pipeline__labels">
              <span className="sc-pipeline__phase-name">{phaseLabels[p]}</span>
              <span className="sc-pipeline__status" style={{ color: (completed || active) ? accent : "var(--ink-5)" }}>
                {statusLabel}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const extractUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (m?.[1]) return m[1];
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
};

const getPrLabel = (url: string): string => {
  try {
    const n = new URL(url).pathname.replace(/\/+$/, "").match(/\/pull\/(\d+)$/)?.[1];
    if (n) return `PR #${n}`;
  } catch { /* fall through */ }
  return "Open PR";
};

export const TicketSummaryCard = memo(function TicketSummaryCard({
  ticket,
  assignedSlotName,
  projectName,
  onOpen,
  phaseLabels,
  phaseColors,
  statusLabels,
  statusColors,
  pausedStatuses,
}: TicketSummaryCardProps) {
  const pausedPhase = ticket.phases.find(
    (p) => !!p.startedAt && !p.completedAt && pausedStatuses.includes(p.status),
  );
  const runningPhase = ticket.phases.find(
    (p) => !!p.startedAt && !p.completedAt && p.status === "RUNNING",
  );
  const runningColor = runningPhase
    ? (statusColors[runningPhase.status] ?? phaseColors[runningPhase.phaseName])
    : null;

  const resolvedPRs = (ticket.pullRequests ?? []).flatMap((pr) => {
    const url = extractUrl(pr.prUrl);
    return url ? [{ ...pr, url }] : [];
  });
  const primaryPR = resolvedPRs[0] ?? null;
  const extraPRs = Math.max(resolvedPRs.length - 1, 0);

  const createdAt = new Date(ticket.createdAt).toLocaleDateString();

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onOpen();
  };
  const stopCardOpen = (e: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
  };

  const pausedColor = pausedPhase
    ? (statusColors[pausedPhase.status] ?? "#B07634")
    : "#B07634";

  return (
    <div
      role="button"
      tabIndex={0}
      className={`ticket-card ticket-card--interactive${runningPhase ? " ticket-card--running" : ""}`}
      style={runningColor ? ({ "--ticket-running-accent": runningColor } as CSSProperties) : undefined}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      aria-label={`Open ticket #${ticket.id}: ${ticket.title}`}
    >
      {/* Running left rail */}
      {runningPhase && (
        <span
          className="ticket-running-rail"
          style={{ background: runningColor ?? "var(--claude)" }}
        />
      )}

      {/* Header row */}
      <div className="sc-header">
        <div className="sc-header__meta">
          <span className="ticket-id mono">#{ticket.id}</span>
          <span className="sc-sep" aria-hidden="true" />
          {projectName && (
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{projectName}</span>
          )}

          {/* Paused/waiting status tags */}
          {pausedPhase && (
            <Tag color={pausedColor}>
              {pausedPhase.status === "QUESTION" ? "?" : "!"}&nbsp;
              {PAUSED_STATUS_LABELS[pausedPhase.status] ?? statusLabels[pausedPhase.status]}
            </Tag>
          )}
          {ticket.waitingForSlot && !pausedPhase && (
            <Tag color="#B07634">Waiting for slot</Tag>
          )}
        </div>
        <span className="ticket-date">{createdAt}</span>
      </div>

      {/* Title */}
      <h3 className="ticket-title serif" style={{ margin: 0 }}>
        {ticket.title}
      </h3>

      {/* Description preview */}
      {ticket.description?.trim() && (
        <p className="ticket-card-description">{ticket.description.trim()}</p>
      )}

      {/* Phase pipeline bars */}
      <PipelineBars
        ticket={ticket}
        phaseColors={phaseColors}
        statusColors={statusColors}
        pausedStatuses={pausedStatuses}
        phaseLabels={phaseLabels}
        statusLabels={statusLabels}
      />

      {/* Paused message preview */}
      {pausedPhase?.lastMessage && (
        <div
          className="sc-paused-preview"
          style={{
            background: `color-mix(in srgb, ${pausedColor} 7%, var(--cream))`,
            borderColor: `color-mix(in srgb, ${pausedColor} 25%, transparent)`,
          }}
        >
          <span className="serif sc-paused-preview__label" style={{ color: pausedColor }}>
            {pausedPhase.status === "QUESTION" ? "Asks:" : pausedPhase.status === "ERROR" ? "Errored:" : "Needs input:"}
          </span>
          {" "}&ldquo;{pausedPhase.lastMessage}&rdquo;
        </div>
      )}

      {/* Footer tags */}
      <div className="ticket-footer">
        <div className="sc-footer-tags">
          {/* Phase/running tag */}
          {runningPhase ? (
            <Tag color={runningColor ?? phaseColors[runningPhase.phaseName]} dot>
              {phaseLabels[runningPhase.phaseName]} running
            </Tag>
          ) : (
            <Tag color={phaseColors[ticket.currentPhase]} dot>
              {phaseLabels[ticket.currentPhase]}
            </Tag>
          )}

          {/* CLI */}
          <Tag color="var(--ink-2)" icon={<IconRobot />}>{CLI_LABELS[ticket.cliType]}</Tag>

          {/* Slot */}
          {assignedSlotName && !ticket.waitingForSlot && (
            <Tag color="var(--ink-3)" icon={<IconMonitor />}>{assignedSlotName}</Tag>
          )}

          {/* Branch */}
          {ticket.branchName && (
            <Tag color="var(--ink-3)" icon={<IconBranch />}>
              <span className="mono" style={{ fontSize: 11 }}>{ticket.branchName}</span>
            </Tag>
          )}

          {/* PR */}
          {primaryPR && (
            <a
              className="sc-pr-link"
              href={primaryPR.url}
              target="_blank"
              rel="noreferrer"
              onClick={stopCardOpen}
              onKeyDown={stopCardOpen}
            >
              {getPrLabel(primaryPR.url)}
              {extraPRs > 0 && <span className="ticket-card-pr-extra"> +{extraPRs}</span>}
            </a>
          )}
        </div>

        <span className="sc-open-hint">
          Open&nbsp;→
        </span>
      </div>
    </div>
  );
});
