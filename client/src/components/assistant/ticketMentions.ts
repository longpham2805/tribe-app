import type { AssistantMessage } from "../../types/assistant";

export const MAX_TICKET_REFERENCES = 5;

const TICKET_REFERENCE_PATTERN = /(?:\bticket\s+#?|#)(\d{1,9})\b/gi;
const HASH_REFERENCE_PATTERN = /^#/;
const EXCLUDED_HASH_PREFIX_PATTERN = /\b(?:pr|mr|pull request)\s*$/i;

export type TicketMentionSource = Pick<AssistantMessage, "content" | "ticketId">;

function addTicketId(ids: number[], seen: Set<number>, value: number | null | undefined) {
  if (value == null || !Number.isSafeInteger(value) || value <= 0 || seen.has(value)) return;
  seen.add(value);
  ids.push(value);
}

function isExcludedHashReference(content: string, matchIndex: number, matchedText: string) {
  if (!HASH_REFERENCE_PATTERN.test(matchedText)) return false;
  const prefix = content.slice(Math.max(0, matchIndex - 20), matchIndex);
  return EXCLUDED_HASH_PREFIX_PATTERN.test(prefix);
}

export function extractTicketMentionIds(source: TicketMentionSource, maxReferences = MAX_TICKET_REFERENCES) {
  const ids: number[] = [];
  const seen = new Set<number>();
  addTicketId(ids, seen, source.ticketId);

  TICKET_REFERENCE_PATTERN.lastIndex = 0;
  for (const match of source.content.matchAll(TICKET_REFERENCE_PATTERN)) {
    if (ids.length >= maxReferences) break;
    if (isExcludedHashReference(source.content, match.index ?? 0, match[0])) continue;
    addTicketId(ids, seen, Number(match[1]));
  }

  return ids.slice(0, maxReferences);
}
