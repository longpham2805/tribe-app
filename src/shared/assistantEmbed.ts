export type AssistantMessageEmbed =
  | { type: "ticket"; ticketId: number; title?: string; phase?: string }
  | { type: "plan"; ticketId: number; phaseId?: number; summary: string }
  | { type: "implementation"; ticketId: number; phaseId?: number; summary: string }
  | { type: "branch"; name: string; ticketId?: number }
  | { type: "pull_request"; url: string; number?: number; title?: string; state?: string; ticketId?: number }
  | { type: "question"; text: string; ticketId?: number; phaseId?: number };
