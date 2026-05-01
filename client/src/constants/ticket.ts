import type { PhaseStatus, Ticket, TicketPhase, TicketStatus } from "../types";

export const PHASES: TicketPhase[] = ["CREATED", "PLANNING", "IMPLEMENTATION", "SHIP"];

export const PHASE_LABELS: Record<TicketPhase, string> = {
  CREATED: "Created",
  PLANNING: "Planning",
  IMPLEMENTATION: "Implementation",
  SHIP: "Ship",
  FEEDBACK: "Feedback",
};

export const PHASE_COLORS: Record<TicketPhase, string> = {
  CREATED: "#8C8779",
  PLANNING: "#5C7B8A",
  IMPLEMENTATION: "#B07634",
  SHIP: "#6F8E5E",
  FEEDBACK: "#8A5C73",
};

export const PAUSED_STATUSES: PhaseStatus[] = ["REQUIRES_ACTION", "QUESTION", "ERROR"];

export const STATUS_LABELS: Record<PhaseStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  COMPLETED: "Completed",
  REQUIRES_ACTION: "Needs input",
  QUESTION: "Question",
  ERROR: "Error",
};

export const STATUS_COLORS: Record<PhaseStatus, string | null> = {
  PENDING: null,
  RUNNING: null,
  COMPLETED: null,
  REQUIRES_ACTION: "#B07634",
  QUESTION: "#B07634",
  ERROR: "#B14B3F",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  DRAFT: "Draft",
  READY: "Ready",
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  DRAFT: "#B07634",
  READY: "#6F8E5E",
};

export const TICKET_GROUPS = ["RUNNING", "WAITING", "DONE"] as const;
export type TicketGroup = typeof TICKET_GROUPS[number];

export const TICKET_GROUP_LABELS: Record<TicketGroup, string> = {
  RUNNING: "In flight",
  WAITING: "Waiting",
  DONE: "Shipped",
};

export const TICKET_GROUP_HINTS: Record<TicketGroup, string> = {
  RUNNING: "Phases currently advancing",
  WAITING: "Queued — waiting for a free slot",
  DONE: "Merged in the last 14 days",
};

export interface TicketPrLink {
  url: string;
  label: string;
}

export const extractPullRequestUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const markdownMatch = trimmed.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1];
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  return null;
};

export const getPullRequestLinkLabel = (url: string): string => {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    const number = path.match(/\/pull\/(\d+)$/)?.[1];

    if (number) return `PR #${number}`;
  } catch {
    return "Open PR";
  }

  return "Open PR";
};

export const getPrimaryPullRequestLink = (
  pullRequests: Ticket["pullRequests"],
): TicketPrLink | null => {
  for (const pullRequest of pullRequests ?? []) {
    const url = extractPullRequestUrl(pullRequest.prUrl);
    if (!url) continue;

    return {
      url,
      label: getPullRequestLinkLabel(url),
    };
  }

  return null;
};
