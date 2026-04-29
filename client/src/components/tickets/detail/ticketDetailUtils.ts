import type { TicketPhase } from "../../../types";

export function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function normalizeTicketDescriptionImages(description: string, ticketId: number): string {
  return description.replace(/!\[([^\]]*)\]\(([^)\s]*\/\.tribe\/[^)\s]*\/images\/([^)\s]+))\)/g, (_match, alt, _legacyUrl, fileName) => {
    const decodedName = (() => {
      try {
        return decodeURIComponent(fileName);
      } catch {
        return fileName;
      }
    })();
    const normalizedUrl = `/api/uploads/tickets/${ticketId}/images/${encodeURIComponent(decodedName)}`;
    return `![${alt}](${normalizedUrl})`;
  });
}

export function fileToPhase(fileName: string): TicketPhase | null {
  const base = fileName.replace(/\.md$/, "").toLowerCase();
  if (base === "planning") return "PLANNING";
  if (base === "implementation") return "IMPLEMENTATION";
  if (base === "ship") return "SHIP";
  if (/^feedback-\d+$/.test(base)) return "FEEDBACK";
  if (base === "ticket") return "CREATED";
  return null;
}
