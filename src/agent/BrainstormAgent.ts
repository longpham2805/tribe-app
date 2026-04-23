import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";

export class BrainstormAgent extends BaseAgent {
  readonly phase = TicketPhase.BRAINSTORM;
  protected readonly skills = [];

  protected roleIntro(): string {
    return "You are handling the BRAINSTORM phase for the following ticket.";
  }

  protected taskInstructions(): string {
    return (
      "Brainstorm a wide set of approaches, trade-offs, and open questions. " +
      "Output thorough markdown notes that will guide the planning phase."
    );
  }
}
