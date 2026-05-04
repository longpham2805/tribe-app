import { Phase } from "../../entity/Phase";
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

