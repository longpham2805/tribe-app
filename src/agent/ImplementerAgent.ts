import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";

export class ImplementerAgent extends BaseAgent {
  readonly phase = TicketPhase.IMPLEMENTATION;
  protected readonly skills = [];

  protected roleIntro(): string {
    return "You are handling the IMPLEMENTATION phase for the following ticket.";
  }

  protected taskInstructions(): string {
    return (
      "Execute the implementation plan. Write the code, make commits, and document " +
      "what was done in a summary. Output an implementation report in markdown."
    );
  }
}
