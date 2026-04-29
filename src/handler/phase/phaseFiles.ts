import { Phase } from "../../entity/Phase";
import { Ticket } from "../../entity/Ticket";
import { TicketPhase } from "../../enum/TicketPhase";

export function feedbackOutputFile(phase: Phase): string {
  return `feedback-${phase.sequence}.md`;
}

export function phaseOutputFile(phaseName: TicketPhase): string | null {
  switch (phaseName) {
    case TicketPhase.PLANNING:
      return "planning.md";
    case TicketPhase.IMPLEMENTATION:
      return "implementation.md";
    case TicketPhase.SHIP:
      return "ship.md";
    default:
      return null;
  }
}

export function suggestFeedbackBranchName(ticket: Ticket, phase: Phase): string {
  return `feedback/${ticket.id}-${phase.sequence}-${slugifyBranchSegment(ticket.title)}`;
}

function slugifyBranchSegment(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "ticket";
}
