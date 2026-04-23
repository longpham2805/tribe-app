import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";

export class ShipAgent extends BaseAgent {
  readonly phase = TicketPhase.SHIP;
  protected readonly skills = ["ship", "git"];
  protected readonly instructionFile = "shipper.md";
}
