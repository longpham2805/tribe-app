import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";
import { ImplementerAgent } from "./ImplementerAgent";
import { PlannerAgent } from "./PlannerAgent";
import { ShipAgent } from "./ShipAgent";

const AGENTS: Partial<Record<TicketPhase, BaseAgent>> = {
  [TicketPhase.PLANNING]: new PlannerAgent(),
  [TicketPhase.IMPLEMENTATION]: new ImplementerAgent(),
  [TicketPhase.SHIP]: new ShipAgent(),
};

export const getAgent = (phase: TicketPhase): BaseAgent | null => AGENTS[phase] ?? null;

export { BaseAgent, MARKER_REGEX, MARKER_TRAILER } from "./BaseAgent";
