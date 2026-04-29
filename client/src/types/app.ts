export type CliType = "CLAUDE" | "CODEX";

export interface AppState {
  id: number;
  autoTriggerEnabled: boolean;
  availableCliTypes: CliType[];
  createdAt: string;
  updatedAt: string;
}
