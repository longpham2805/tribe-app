import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";

export class PlannerAgent extends BaseAgent {
  readonly phase = TicketPhase.PLANNING;
  protected readonly skills = [];

  protected roleIntro(): string {
    return "You are handling the PLANNING phase for the following ticket.";
  }

  protected taskInstructions(): string {
    return (
      "Produce a concrete, step-by-step implementation plan in markdown. " +
      "Include file paths, function signatures, and acceptance criteria."
    );
  }
}
