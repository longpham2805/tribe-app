import { memo } from "react";
import {
  PAUSED_STATUSES,
  PHASE_COLORS,
  PHASE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TICKET_GROUP_HINTS,
  TICKET_GROUP_LABELS,
  type TicketGroup,
} from "../../constants/ticket";
import type { Ticket } from "../../types";
import { TicketSummaryCard } from "./TicketSummaryCard";

type TicketGroupSectionProps = {
  group: TicketGroup;
  tickets: Ticket[];
  count: number;
  getSlotName: (slotId: number | null) => string | null;
  getProjectName: (projectId: number | null) => string | null;
  onOpenTicket: (ticketId: number) => void;
  action?: { label: string; disabled?: boolean; onClick: () => void } | null;
};

export const TicketGroupSection = memo(function TicketGroupSection({
  group,
  tickets,
  count,
  getSlotName,
  getProjectName,
  onOpenTicket,
  action,
}: TicketGroupSectionProps) {
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
