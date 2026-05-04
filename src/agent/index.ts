import { TicketPhase } from "../enum/TicketPhase";
import { BaseAgent } from "./BaseAgent";
import { FeedbackAgent } from "./FeedbackAgent";
import { ImplementerAgent } from "./ImplementerAgent";
import { PlannerAgent } from "./PlannerAgent";

const AGENTS: Partial<Record<TicketPhase, BaseAgent>> = {
  [TicketPhase.PLANNING]: new PlannerAgent(),
  [TicketPhase.IMPLEMENTATION]: new ImplementerAgent(),
  [TicketPhase.FEEDBACK]: new FeedbackAgent(),
};

export const getAgent = (phase: TicketPhase): BaseAgent | null => AGENTS[phase] ?? null;

export { BaseAgent, MARKER_REGEX, MARKER_TRAILER } from "./BaseAgent";
export type { FollowupPromptContext, ProjectAgentContext } from "./BaseAgent";
