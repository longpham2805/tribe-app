import type { AssistantAction } from "../entity/AssistantAction";
import type { AssistantMessage } from "../entity/AssistantMessage";
import type { AssistantMessageEmbed } from "../shared/assistantEmbed";

export const DISCORD_MESSAGE_LIMIT = 2000;

export type DiscordAssistantCommand =
  | { type: "list_actions" }
  | { type: "approve"; actionId: number }
  | { type: "reject"; actionId: number }
  | { type: "help"; error?: string };

export interface DiscordInboundSnapshot {
  channelId: string;
  content: string;
  authorBot?: boolean;
  webhookId?: string | null;
  createdTimestamp: number;
  attachmentCount?: number;
}

export interface DiscordAssistantMessageButton {
  label: string;
  url: string;
}

export interface DiscordAssistantMessagePayload {
  content: string;
  buttons: DiscordAssistantMessageButton[];
}

export type DiscordInboundDecision =
  | { kind: "ignore"; reason: "wrong_thread" | "bot" | "webhook" | "old" | "empty" }
  | { kind: "command"; command: DiscordAssistantCommand }
  | { kind: "prompt"; content: string }
  | { kind: "attachment_only" };

export function parseDiscordAssistantCommand(content: string, prefix: string): DiscordAssistantCommand | null {
  const trimmed = content.trim();
  if (trimmed !== prefix && !trimmed.startsWith(`${prefix} `)) return null;

  const body = trimmed.slice(prefix.length).trim();
  if (!body) return { type: "help" };

  const [verbRaw, idRaw] = body.split(/\s+/, 2);
  const verb = verbRaw.toLowerCase();

  if (verb === "actions" || verb === "action" || verb === "pending") {
    return { type: "list_actions" };
  }

  if (verb === "approve" || verb === "reject") {
    const actionId = Number(idRaw);
    if (!Number.isInteger(actionId) || actionId <= 0) {
      return { type: "help", error: `Expected an action id after ${verb}.` };
    }
    return { type: verb, actionId };
  }

  return { type: "help", error: `Unknown command: ${verbRaw}` };
}

export function classifyDiscordInboundMessage(
  message: DiscordInboundSnapshot,
  opts: { threadId: string; prefix: string; startedAtMs: number },
): DiscordInboundDecision {
  if (message.channelId !== opts.threadId) return { kind: "ignore", reason: "wrong_thread" };
  if (message.authorBot) return { kind: "ignore", reason: "bot" };
  if (message.webhookId) return { kind: "ignore", reason: "webhook" };
  if (message.createdTimestamp < opts.startedAtMs) return { kind: "ignore", reason: "old" };

  const content = message.content.trim();
  const command = parseDiscordAssistantCommand(content, opts.prefix);
  if (command) return { kind: "command", command };

  if (content) return { kind: "prompt", content };
  if ((message.attachmentCount ?? 0) > 0) return { kind: "attachment_only" };
  return { kind: "ignore", reason: "empty" };
}

export function shouldMirrorAssistantMessageToDiscord(message: AssistantMessage, startedAtMs: number): boolean {
  if (new Date(message.createdAt).getTime() < startedAtMs) return false;
  return !(message.role === "user" && message.metadata?.origin === "discord");
}

export function chunkDiscordText(text: string, limit = DISCORD_MESSAGE_LIMIT): string[] {
  const normalized = text.trim() || "(empty)";
  if (normalized.length <= limit) return [normalized];

  const chunks: string[] = [];
  let current = "";

  for (const line of normalized.split("\n")) {
    const pending = current ? `${current}\n${line}` : line;
    if (pending.length <= limit) {
      current = pending;
      continue;
    }

    if (current) chunks.push(current);

    let remainder = line;
    while (remainder.length > limit) {
      chunks.push(remainder.slice(0, limit));
      remainder = remainder.slice(limit);
    }
    current = remainder;
  }

  if (current) chunks.push(current);
  return chunks;
}

export function formatAssistantMessageForDiscord(message: AssistantMessage): string {
  return formatAssistantMessagePayloadForDiscord(message).content;
}

export function formatAssistantMessagePayloadForDiscord(message: AssistantMessage): DiscordAssistantMessagePayload {
  const label = message.role === "user"
    ? "Tribe UI user"
    : message.role === "system"
      ? "Tribe system"
      : "Tribe assistant";
  const qualifiers = [
    message.severity !== "info" ? message.severity.toUpperCase() : "",
    message.ticketId ? `ticket #${message.ticketId}` : "",
  ].filter(Boolean);
  const header = qualifiers.length > 0 ? `**${label} (${qualifiers.join(", ")})**` : `**${label}**`;
  const embedText = formatAssistantEmbedsForDiscord(message.embeds ?? null);
  return {
    content: [header, message.content.trim(), embedText].filter(Boolean).join("\n\n"),
    buttons: buildAssistantMessageButtonsForDiscord(message.embeds ?? null),
  };
}

export function formatAssistantEmbedsForDiscord(embeds: AssistantMessageEmbed[] | null): string {
  if (!embeds?.length) return "";

  const lines = embeds.map((embed) => {
    switch (embed.type) {
      case "ticket":
        return `- Ticket #${embed.ticketId}${embed.title ? `: ${embed.title}` : ""}${embed.phase ? ` (${embed.phase})` : ""}`;
      case "plan":
        return `- Plan for ticket #${embed.ticketId}: ${embed.summary}`;
      case "implementation":
        return `- Implementation for ticket #${embed.ticketId}: ${embed.summary}`;
      case "branch":
        return `- Branch${embed.ticketId ? ` for ticket #${embed.ticketId}` : ""}: ${embed.name}`;
      case "pull_request":
        return `- PR${embed.number ? ` #${embed.number}` : ""}${embed.ticketId ? ` for ticket #${embed.ticketId}` : ""}: ${embed.url}`;
      case "question":
        return `- Question${embed.ticketId ? ` for ticket #${embed.ticketId}` : ""}: ${embed.text}`;
      default:
        return null;
    }
  }).filter((line): line is string => Boolean(line));

  return lines.length > 0 ? `Context:\n${lines.join("\n")}` : "";
}

export function buildAssistantMessageButtonsForDiscord(embeds: AssistantMessageEmbed[] | null): DiscordAssistantMessageButton[] {
  if (!embeds?.length) return [];

  const buttons: DiscordAssistantMessageButton[] = [];
  const seenUrls = new Set<string>();

  for (const embed of embeds) {
    if (embed.type !== "pull_request" || !isSafeDiscordButtonUrl(embed.url)) continue;
    if (seenUrls.has(embed.url)) continue;

    seenUrls.add(embed.url);
    buttons.push({
      label: embed.number ? `Open PR #${embed.number}` : "Open PR",
      url: embed.url,
    });

    if (buttons.length >= 5) break;
  }

  return buttons;
}

function isSafeDiscordButtonUrl(url: string): boolean {
  if (url.length > 512) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function formatAssistantActionForDiscord(action: AssistantAction): string {
  const title = action.status === "proposed"
    ? `**Pending Tribe action #${action.id}**`
    : `**Tribe action #${action.id} ${action.status}**`;
  const payloadTicketId = typeof action.payload?.ticketId === "number" ? action.payload.ticketId : null;
  const ticketId = action.ticketId ?? payloadTicketId;
  const lines = [
    title,
    `Type: ${action.type.replace(/_/g, " ")}`,
    ticketId ? `Ticket: #${ticketId}` : "",
    action.reason ? `Reason: ${action.reason}` : "",
    action.errorMessage ? `Error: ${action.errorMessage}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function formatPendingActionsForDiscord(actions: AssistantAction[]): string {
  if (actions.length === 0) return "No pending Tribe assistant actions.";
  return actions.map((action) => {
    const ticket = action.ticketId ? ` ticket #${action.ticketId}` : "";
    return `#${action.id} - ${action.type.replace(/_/g, " ")}${ticket}`;
  }).join("\n");
}
