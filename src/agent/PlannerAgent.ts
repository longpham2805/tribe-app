import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";

export class PlannerAgent extends BaseAgent {
  readonly phase = TicketPhase.PLANNING;
  protected readonly skills = [];
  protected readonly instructionFile = "planner.md";
}
