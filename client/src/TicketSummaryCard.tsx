import type { CSSProperties } from "react";
import type { PhaseStatus, Ticket, TicketPhase } from "./types";

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

export function TicketSummaryCard({
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

  const createdAt = new Date(ticket.createdAt).toLocaleDateString();
  const hasPullRequests = (ticket.pullRequests?.length ?? 0) > 0;
  const detailHint = ticket.branchName
    ? `Branch ${ticket.branchName}`
    : hasPullRequests
      ? `${ticket.pullRequests?.length ?? 0} PR${ticket.pullRequests?.length === 1 ? "" : "s"}`
      : null;

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
    alignItems: "center",
    flexWrap: "wrap",
  };

  return (
    <button
      type="button"
      className="ticket-card"
      style={clickableCardStyle}
      onClick={onOpen}
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
        </div>
        <span className="ticket-date">{createdAt}</span>
      </div>

      <h3 className="ticket-title" style={{ margin: 0 }}>
        {ticket.title}
      </h3>

      <div style={footerStyle}>
        <span className="ticket-date" style={{ color: "#64748b" }}>
          {detailHint ?? "Open for details"}
        </span>
        <span className="ticket-date">View details</span>
      </div>
    </button>
  );
}
