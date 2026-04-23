import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";
import { BrainstormAgent } from "./BrainstormAgent";
import { ImplementerAgent } from "./ImplementerAgent";
import { PlannerAgent } from "./PlannerAgent";

const AGENTS: Partial<Record<TicketPhase, BaseAgent>> = {
  [TicketPhase.BRAINSTORM]: new BrainstormAgent(),
  [TicketPhase.PLANNING]: new PlannerAgent(),
  [TicketPhase.IMPLEMENTATION]: new ImplementerAgent(),
};

export const getAgent = (phase: TicketPhase): BaseAgent | null => AGENTS[phase] ?? null;

export { BaseAgent, MARKER_REGEX, MARKER_TRAILER } from "./BaseAgent";
