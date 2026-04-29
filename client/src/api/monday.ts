import type { CliType, MondayItemPreview, MondayNotStartedItem, Ticket } from "../types";
import { API_BASE, readJsonError } from "./request";

export async function fetchMondayNotStarted(projectId?: number): Promise<MondayNotStartedItem[]> {
  const url = projectId != null
    ? `${API_BASE}/monday/not-started?projectId=${projectId}`
    : `${API_BASE}/monday/not-started`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to fetch Monday tickets"));
  const body = await res.json();
  return body.items ?? [];
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
    if (res.ok) return res.json();
    const body = await res.json().catch(() => ({})) as { error?: unknown };
    lastError = typeof body.error === "string" ? body.error : lastError;
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
  const res = await fetch(`${API_BASE}/monday/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mondayItemId,
      ...(clues?.trim() ? { clues } : {}),
      ...(projectId != null ? { projectId } : {}),
      ...(cliType ? { cliType } : {}),
      ...(titleOverride?.trim() ? { titleOverride } : {}),
    }),
  });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to import Monday item"));
  const body = await res.json();
  return body.ticket as Ticket;
}
