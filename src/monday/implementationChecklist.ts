import { postMonday, tryPostMonday, type MondayPostContext } from "./graphqlClient";
import { parseItemId } from "./parseItemId";
import type { ChecklistUpsertResult, MondayUpdate, MondayUser } from "./types";
import { MondayClientError } from "./types";

const CHECKLIST_TITLE_HTML =
  "<p><strong>Implementation and Testing checklist</strong></p>";
const CHECKLIST_MARKER_TEXT = "implementation and testing checklist";

const CHECKLIST_CTX = (base: MondayPostContext): MondayPostContext => ({
  ...base,
  apiVersion: "2024-10",
});

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function stripHtmlToPlain(html: string): string {
  const noTags = html.replace(/<[^>]*>/g, " ");
  return normalizeWhitespace(noTags);
}

function creatorMatches(person: string, creator: MondayUser | null): boolean {
  if (!creator) return false;
  const p = person.trim();
  if (!p) return false;
  if (/^\d+$/.test(p)) {
    return creator.id === p;
  }
  return normalizeWhitespace(creator.name).toLowerCase() === normalizeWhitespace(p).toLowerCase();
}

function isImplementationChecklistBody(body: string): boolean {
  const plain = stripHtmlToPlain(body);
  const normalized = plain.toLowerCase();
  return normalized.includes(CHECKLIST_MARKER_TEXT) || normalized.startsWith("implement");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineToHtml(text: string): string {
  const input = text ?? "";
  let out = "";
  let i = 0;
  while (i < input.length) {
    const tickStart = input.indexOf("`", i);
    if (tickStart < 0) {
      out += escapeHtml(input.slice(i));
      break;
    }
    out += escapeHtml(input.slice(i, tickStart));
    const tickEnd = input.indexOf("`", tickStart + 1);
    if (tickEnd < 0) {
      out += escapeHtml(input.slice(tickStart));
      break;
    }
    const codeContent = input.slice(tickStart + 1, tickEnd);
    out += `<code>${escapeHtml(codeContent)}</code>`;
    i = tickEnd + 1;
  }
  return out;
}

function isListLine(line: string): boolean {
  return /^[-*]\s+/.test(line);
}

function listItemToHtml(line: string): string {
  const checkboxMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
  if (checkboxMatch) {
    const mark = checkboxMatch[1].toLowerCase() === "x" ? "[x]" : "[ ]";
    return `<li>${mark} ${inlineToHtml(checkboxMatch[2])}</li>`;
  }
  const bulletMatch = line.match(/^[-*]\s+(.+)$/);
  if (bulletMatch) {
    return `<li>${inlineToHtml(bulletMatch[1])}</li>`;
  }
  return `<li>${inlineToHtml(line)}</li>`;
}

function contentToHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  const lines = trimmed.split(/\r?\n/);
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i += 1;
      continue;
    }

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      blocks.push(`<p><strong>${inlineToHtml(headingMatch[1])}</strong></p>`);
      i += 1;
      continue;
    }

    if (isListLine(line)) {
      const items: string[] = [];
      while (i < lines.length && isListLine(lines[i].trim())) {
        items.push(listItemToHtml(lines[i].trim()));
        i += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const paragraphLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next || /^#{1,6}\s+/.test(next) || isListLine(next)) break;
      paragraphLines.push(next);
      i += 1;
    }
    const paragraphText = paragraphLines.map((l) => inlineToHtml(l)).join("<br />");
    blocks.push(`<p>${paragraphText}</p>`);
  }

  return blocks.join("");
}

function composeUpdateBody(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return CHECKLIST_TITLE_HTML;
  const inner = /^\s*</.test(trimmed) ? trimmed : contentToHtml(content);
  return `${CHECKLIST_TITLE_HTML}${inner}`;
}

async function runMutation<T>(
  ctx: MondayPostContext,
  query: string,
  operationName: string,
  variables: Record<string, string>,
): Promise<
  | { ok: true; data: T }
  | { ok: false; httpError?: string; gqlErrors?: string[] }
> {
  return tryPostMonday<T>(ctx, {
    query,
    operationName,
    variables: variables as Record<string, unknown>,
  });
}

function isSchemaMismatchError(messages: string[] = []): boolean {
  const joined = messages.join(" ").toLowerCase();
  return (
    joined.includes("cannot query field") ||
    joined.includes("unknown argument") ||
    joined.includes("unknown type") ||
    (joined.includes("field") && joined.includes("is not defined"))
  );
}

async function setUpdatePinned(
  ctx: MondayPostContext,
  updateId: string,
  itemId: string,
  pinned: boolean,
): Promise<{ ok: boolean; warning?: string; mutationUsed?: string }> {
  const attempts: Array<{
    id: string;
    query: string;
    operationName: string;
    variables: Record<string, string>;
  }> = pinned
    ? [
        {
          id: "pin_to_top(id,item_id)",
          operationName: "PinToTop",
          query:
            "mutation PinToTop($id: ID!, $itemId: ID) { pin_to_top(id: $id, item_id: $itemId) { id } }",
          variables: { id: updateId, itemId },
        },
      ]
    : [
        {
          id: "unpin_from_top(id,item_id)",
          operationName: "UnpinFromTop",
          query:
            "mutation UnpinFromTop($id: ID!, $itemId: ID) { unpin_from_top(id: $id, item_id: $itemId) { id } }",
          variables: { id: updateId, itemId },
        },
      ];

  let lastWarning = "";
  for (const attempt of attempts) {
    const res = await runMutation<Record<string, { id: string } | null>>(
      ctx,
      attempt.query,
      attempt.operationName,
      attempt.variables,
    );
    if (res.ok) {
      return { ok: true, mutationUsed: attempt.id };
    }
    if (res.httpError) {
      lastWarning = `HTTP error during ${attempt.id}: ${res.httpError}`;
      break;
    }
    const gqlErrors = res.gqlErrors ?? [];
    if (!isSchemaMismatchError(gqlErrors)) {
      lastWarning = `GraphQL error during ${attempt.id}: ${gqlErrors.join("; ")}`;
      break;
    }
    lastWarning = `Schema mismatch for ${attempt.id}: ${gqlErrors.join("; ")}`;
  }

  return {
    ok: false,
    warning:
      lastWarning ||
      `Unable to ${pinned ? "pin" : "unpin"} update ${updateId}; no supported mutation worked.`,
  };
}

export async function upsertImplementationChecklist(
  baseCtx: MondayPostContext,
  args: { itemIdOrLink: string; person: string; content: string },
): Promise<ChecklistUpsertResult> {
  const ctx = CHECKLIST_CTX(baseCtx);

  const itemId = parseItemId(args.itemIdOrLink ?? "");
  if (itemId == null) {
    throw new MondayClientError(
      "validation",
      `Could not parse item ID from "${args.itemIdOrLink}". Provide a numeric item ID or a Monday item URL containing /pulses/<id>.`,
    );
  }

  const bodyHtml = composeUpdateBody(args.content);

  const query = `query GetItemUpdates($itemId: [ID!]) {
  items(ids: $itemId) {
    id
    updates(limit: 100) {
      id
      body
      created_at
      updated_at
      creator {
        id
        name
      }
    }
  }
}`;

  const data = await postMonday<{ items?: Array<{ id: string; updates?: MondayUpdate[] }> }>(
    ctx,
    {
      query,
      operationName: "GetItemUpdates",
      variables: { itemId: [String(itemId)] },
    },
  );

  const items = data.items ?? [];
  if (items.length === 0) {
    throw new MondayClientError(
      "not_found",
      `No item found for ID ${itemId}. It may not exist or you may not have access.`,
    );
  }

  const updates = items[0].updates ?? [];
  const matches = updates.filter(
    (u) => creatorMatches(args.person, u.creator) && isImplementationChecklistBody(u.body),
  );

  const pickLatest = (list: MondayUpdate[]): MondayUpdate | null => {
    if (list.length === 0) return null;
    return list.reduce((best, u) => {
      const bestT = Date.parse(best.updated_at || best.created_at);
      const uT = Date.parse(u.updated_at || u.created_at);
      return uT >= bestT ? u : best;
    });
  };

  const target = pickLatest(matches);

  if (target) {
    const mutation = `mutation EditUpdate($id: ID!, $body: String!) {
  edit_update(id: $id, body: $body) {
    id
    body
  }
}`;
    const editRes = await runMutation<{ edit_update?: { id: string; body: string } | null }>(
      ctx,
      mutation,
      "EditUpdate",
      { id: target.id, body: bodyHtml },
    );
    if (!editRes.ok) {
      const errText = editRes.httpError
        ? `Monday API error (edit_update): ${editRes.httpError}`
        : `Monday API errors:\n${(editRes.gqlErrors ?? []).join("\n")}`;
      throw new MondayClientError("graphql", errText);
    }
    const out = editRes.data.edit_update;
    const targetId = out?.id ?? target.id;

    const staleIds = matches.map((m) => m.id).filter((id) => id !== targetId);
    const unpinResults = await Promise.all(
      staleIds.map((id) => setUpdatePinned(ctx, id, String(itemId), false)),
    );
    const pinResult = await setUpdatePinned(ctx, targetId, String(itemId), true);
    const pinWarnings = [
      ...unpinResults.filter((r) => !r.ok && r.warning).map((r) => r.warning as string),
      ...(pinResult.ok ? [] : [pinResult.warning ?? "Pin operation failed."]),
    ];

    return {
      action: "edited",
      itemId: String(itemId),
      updateId: targetId,
      ok: out != null,
      pinned: pinResult.ok,
      pinAction: pinResult.ok ? "pinned" : "pin-failed",
      pinMutation: pinResult.mutationUsed ?? null,
      pinWarning: pinWarnings.length ? pinWarnings.join(" | ") : null,
    };
  }

  const createMutation = `mutation CreateUpdate($itemId: ID!, $body: String!) {
  create_update(item_id: $itemId, body: $body) {
    id
  }
}`;
  const createRes = await runMutation<{ create_update?: { id: string } | null }>(
    ctx,
    createMutation,
    "CreateUpdate",
    { itemId: String(itemId), body: bodyHtml },
  );
  if (!createRes.ok) {
    const errText = createRes.httpError
      ? `Monday API error (create_update): ${createRes.httpError}`
      : `Monday API errors:\n${(createRes.gqlErrors ?? []).join("\n")}`;
    throw new MondayClientError("graphql", errText);
  }
  const created = createRes.data.create_update;
  const pinResult =
    created?.id != null
      ? await setUpdatePinned(ctx, created.id, String(itemId), true)
      : { ok: false, warning: "create_update did not return an id." };

  return {
    action: "created",
    itemId: String(itemId),
    updateId: created?.id ?? null,
    ok: created != null,
    pinned: pinResult.ok,
    pinAction: pinResult.ok ? "pinned" : "pin-failed",
    pinMutation: pinResult.ok ? pinResult.mutationUsed ?? null : null,
    pinWarning: pinResult.ok ? null : pinResult.warning ?? "Pin operation failed.",
    note:
      "New updates are authored by the MONDAY_ACCESS_TOKEN user; future upserts with the same person filter only work if person matches that user.",
  };
}
