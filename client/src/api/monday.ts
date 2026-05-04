import type { CliType, MondayItemPreview, MondayNotStartedItem, Ticket } from "../types";
import { API_BASE, readApiError, readJson } from "./request";

export type MondayNotStartedResponse = {
  count: number;
  items: MondayNotStartedItem[];
};

export type MondayImportPayload = {
  mondayItemId: string;
  clues?: string;
  projectId?: number;
  cliType?: CliType;
  titleOverride?: string;
};

export type MondayImportResponse = {
  action: "created" | "updated";
  ticket: Ticket;
  markdown: string;
};

export async function fetchMondayNotStarted(projectId?: number): Promise<MondayNotStartedItem[]> {
  const url = projectId != null
    ? `${API_BASE}/monday/not-started?projectId=${projectId}`
    : `${API_BASE}/monday/not-started`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await readApiError(res, "Failed to fetch Monday tickets"));
  const body = await readJson<MondayNotStartedResponse>(res);
  return body.items;
}

export async function fetchMondayItemPreview(itemId: string, projectId?: number | null): Promise<MondayItemPreview> {
  const encodedId = encodeURIComponent(itemId);
  const query = projectId != null ? `?projectId=${encodeURIComponent(String(projectId))}` : "";
  const urls = [
    `${API_BASE}/monday/items/${encodedId}/preview${query}`,
    `${API_BASE}/monday/items/${encodedId}${query}`,
  ];

  let lastError = "Failed to fetch item details";
  for (const url of urls) {
    const res = await fetch(url);
    if (res.ok) return readJson<MondayItemPreview>(res);
    lastError = await readApiError(res, lastError);
    if (res.status !== 404) break;
  }

  throw new Error(lastError);
}

export async function importMondayItem(
  mondayItemId: string,
  clues?: string,
  projectId?: number | null,
  cliType?: CliType,
  titleOverride?: string,
): Promise<Ticket> {
  const payload: MondayImportPayload = {
    mondayItemId,
    ...(clues?.trim() ? { clues } : {}),
    ...(projectId != null ? { projectId } : {}),
    ...(cliType ? { cliType } : {}),
    ...(titleOverride?.trim() ? { titleOverride } : {}),
  };
  const res = await fetch(`${API_BASE}/monday/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to import Monday item"));
  const body = await readJson<MondayImportResponse>(res);
  return body.ticket;
}
