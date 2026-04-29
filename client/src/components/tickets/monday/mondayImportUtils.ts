import type { MondayNotStartedItem, MondayPreviewImage } from "../../../types";

export type PriorityKey = "critical" | "high" | "medium" | "low" | "neutral";

export function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "updated just now";
  if (mins < 60) return `updated ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `updated ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `updated ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `updated ${months}mo ago`;
  return `updated ${Math.floor(months / 12)}y ago`;
}

function formatAssignee(text: string | null | undefined): string {
  if (!text?.trim()) return "";
  return text
    .split(/\s*,\s*/)
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");
}

function timestampFromMondayText(text: string): string | undefined {
  const value = text.trim();
  if (!value) return undefined;
  const normalized = value.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC$/i, "$1T$2Z");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function getBoardLabel(projectName: string | undefined): string {
  const name = projectName?.trim();
  if (!name) return "Monday board";
  return /roadmap|board/i.test(name) ? name : `${name} board`;
}

export function getPriorityKey(label: string): PriorityKey {
  const key = label.trim().toLowerCase();
  if (key === "critical" || key === "high" || key === "medium" || key === "low") return key;
  return "neutral";
}

export function getItemMeta(item: MondayNotStartedItem) {
  const columnValues = item.column_values ?? [];
  const peopleText = columnValues.find((column) => column.id === "people")?.text ?? "";
  const priority =
    columnValues.find((column) => column.id === "priority" || column.id === "priority4")?.text?.trim() ?? "";
  const rawTags =
    columnValues.find((column) => column.id === "tags" || column.id === "label" || column.id === "labels")?.text ?? "";
  const tags = rawTags ? rawTags.split(",").map((tag) => tag.trim()).filter(Boolean) : [];
  const lastUpdatedText = columnValues.find((column) => column.id === "last_updated")?.text?.trim() ?? "";
  const updatedAtIso = item.updated_at || timestampFromMondayText(lastUpdatedText);

  return {
    people: formatAssignee(peopleText),
    priority,
    tags,
    updatedAt: formatRelativeTime(updatedAtIso),
  };
}

export async function previewImageToFile(image: MondayPreviewImage): Promise<File> {
  const res = await fetch(image.dataUrl);
  const blob = await res.blob();
  return new File([blob], image.fileName, { type: image.mimeType || blob.type || "image/png" });
}
