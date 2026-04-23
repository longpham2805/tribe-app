import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";

export class ImplementerAgent extends BaseAgent {
  readonly phase = TicketPhase.IMPLEMENTATION;
  protected readonly skills = [];
  protected readonly instructionFile = "fullstack-developer.md";
}
