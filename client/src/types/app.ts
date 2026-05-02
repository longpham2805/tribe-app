export type CliType = "CLAUDE" | "CODEX";

export interface AppState {
  id: number;
  autoTriggerEnabled: boolean;
  availableCliTypes: CliType[];
  discordBotToken: null;
  discordBotTokenConfigured: boolean;
  discordAssistantThreadId: string | null;
  createdAt: string;
  updatedAt: string;
}
