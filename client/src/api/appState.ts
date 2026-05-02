import type { AppState, CliType } from "../types";
import { API_BASE, readJsonError } from "./request";

export async function fetchAppState(): Promise<AppState> {
  const res = await fetch(`${API_BASE}/app-state`);
  if (!res.ok) throw new Error("Failed to fetch app state");
  return res.json();
}

export async function updateAppState(data: {
  autoTriggerEnabled?: boolean;
  availableCliTypes?: CliType[];
  discordBotToken?: string | null;
  discordAssistantThreadId?: string | null;
}): Promise<AppState> {
  const res = await fetch(`${API_BASE}/app-state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to update app state"));
  return res.json();
}
