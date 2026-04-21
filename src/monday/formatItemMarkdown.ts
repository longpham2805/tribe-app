import type { MondayItemDetail, MondayUpdate } from "./types";

/**
 * Converts a MondayItemDetail into a structured markdown document
 * suitable for storing in the database.
 */
export function formatItemMarkdown(item: MondayItemDetail): string {
  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────
  lines.push(`# ${item.name}`);
  lines.push("");
  lines.push(`**Monday ID:** ${item.id}`);
  lines.push("");

  // ── Column Values ───────────────────────────────────────────────
  const columns = (item.column_values ?? []).filter((c) => c.text);
  if (columns.length > 0) {
    lines.push("## Fields");
    lines.push("");
    lines.push("| Column | Value |");
    lines.push("|--------|-------|");
    for (const col of columns) {
      // Escape pipes in text to keep the table valid
      const safeText = (col.text ?? "").replace(/\|/g, "\\|");
      lines.push(`| ${col.id} | ${safeText} |`);
    }
    lines.push("");
  }

  // ── Updates / Comments ──────────────────────────────────────────
  const updates = item.updates ?? [];
  if (updates.length > 0) {
    lines.push("## Updates");
    lines.push("");
    for (const update of updates) {
      lines.push(formatUpdate(update));
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function formatUpdate(update: MondayUpdate): string {
  const parts: string[] = [];

  const author = update.creator?.name ?? "Unknown";
  const date = update.created_at?.slice(0, 10) ?? "";

  parts.push(`### ${author} — ${date}`);
  parts.push("");
  parts.push(stripHtml(update.body));
  parts.push("");

  const replies = update.replies ?? [];
  if (replies.length > 0) {
    for (const reply of replies) {
      const rAuthor = reply.creator?.name ?? "Unknown";
      const rDate = reply.created_at?.slice(0, 10) ?? "";
      parts.push(`> **${rAuthor}** (${rDate}): ${stripHtml(reply.body)}`);
      parts.push("");
    }
  }

  return parts.join("\n");
}

/**
 * Minimal HTML → plain text conversion for Monday update bodies.
 * Handles the most common tags Monday uses (p, br, div, strong, em, li, etc.).
 */
function stripHtml(html: string): string {
  if (!html) return "";

  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<code>(.*?)<\/code>/gi, "`$1`")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
