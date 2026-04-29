import type { Slot } from "../types";
import { API_BASE, readJsonError } from "./request";

export async function fetchSlots(projectId?: number): Promise<Slot[]> {
  const url = projectId != null ? `${API_BASE}/slots?projectId=${projectId}` : `${API_BASE}/slots`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch slots");
  return res.json();
}

export async function createSlot(data: {
  name: string;
  rootPath: string;
  projectId?: number | null;
}): Promise<Slot> {
  const res = await fetch(`${API_BASE}/slots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create slot");
  return res.json();
}

export async function updateSlot(
  id: number,
  data: { name?: string; rootPath?: string },
): Promise<Slot> {
  const res = await fetch(`${API_BASE}/slots/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update slot");
  return res.json();
}

export async function deleteSlot(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/slots/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to delete slot"));
}
