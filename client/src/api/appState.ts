import type { AppState, CliType } from "../types";
import { API_BASE, readApiError, readJson } from "./request";

export type AppStateUpdatePayload = {
  autoTriggerEnabled?: boolean;
  availableCliTypes?: CliType[];
  discordBotToken?: string | null;
  discordAssistantThreadId?: string | null;
};

export async function fetchAppState(): Promise<AppState> {
  const res = await fetch(`${API_BASE}/app-state`);
  if (!res.ok) throw new Error("Failed to fetch app state");
  return readJson<AppState>(res);
}

export async function updateAppState(data: AppStateUpdatePayload): Promise<AppState> {
  const res = await fetch(`${API_BASE}/app-state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to update app state"));
  return readJson<AppState>(res);
}
