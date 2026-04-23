import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";

export class PlannerAgent extends BaseAgent {
  readonly phase = TicketPhase.PLANNING;
  protected readonly skills = ["plan", "scout", "report-format"];
  protected readonly instructionFile = "planner.md";
}
