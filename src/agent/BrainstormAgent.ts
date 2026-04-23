import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";

export class BrainstormAgent extends BaseAgent {
  readonly phase = TicketPhase.BRAINSTORM;
  protected readonly skills = ["brainstorm", "scout", "report-format"];
  protected readonly instructionFile = "brainstormer.md";
}
