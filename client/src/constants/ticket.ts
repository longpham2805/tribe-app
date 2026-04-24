import type { PhaseStatus, Ticket, TicketPhase } from "../types";

export const PHASES: TicketPhase[] = ["CREATED", "PLANNING", "IMPLEMENTATION", "SHIP"];

export const PHASE_LABELS: Record<TicketPhase, string> = {
  CREATED: "Created",
  PLANNING: "Planning",
  IMPLEMENTATION: "Implementation",
  SHIP: "Ship",
};

export const PHASE_COLORS: Record<TicketPhase, string> = {
  CREATED: "#6b7280",
  PLANNING: "#3b82f6",
  IMPLEMENTATION: "#f59e0b",
  SHIP: "#10b981",
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
  REQUIRES_ACTION: "#f59e0b",
  QUESTION: "#f59e0b",
  ERROR: "#ef4444",
};

export const TICKET_GROUPS = ["RUNNING", "WAITING", "DONE"] as const;
export type TicketGroup = typeof TICKET_GROUPS[number];

export const TICKET_GROUP_LABELS: Record<TicketGroup, string> = {
  RUNNING: "Running",
  WAITING: "Waiting",
  DONE: "Done",
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
