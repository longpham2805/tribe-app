export type ActivityKind =
  | "system"
  | "run"
  | "message"
  | "tool"
  | "command"
  | "result"
  | "raw"
  | "unknown";

export type ActivitySeverity = "info" | "warn" | "error";
export type ActivityTone = "primary" | "meta";

export type ActivityDetail =
  | string
  | number
  | boolean
  | null
  | ActivityDetail[]
  | { [key: string]: ActivityDetail };

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  timestamp?: string;
  actor?: string;
  title: string;
  summary?: string;
  detail?: ActivityDetail;
  raw: unknown;
  severity: ActivitySeverity;
}

export interface ActivityTypeOption {
  key: string;
  label: string;
}

export interface ActivityMarkdownEntry {
  id: string;
  content: string;
  tone: ActivityTone;
  severity: ActivitySeverity;
  subtypeLabel: string;
  typeKey: string;
}

type UnknownRecord = Record<string, unknown>;

interface AssistantContentBlock extends UnknownRecord {
  type?: string;
  name?: string;
  text?: string;
  input?: unknown;
}

interface MessageContentBlock extends UnknownRecord {
  type?: string;
  text?: string;
  content?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
}

const SECRET_KEY_PATTERN =
  /(token|secret|authorization|api[-_]?key|password|cookie|session|credential)/i;
const BEARER_VALUE_PATTERN = /^Bearer\s+/i;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function activityTypeKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "-");
}

function formatTime(timestamp?: string): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function eventTimestamp(event: UnknownRecord): string | undefined {
  return asString(event.at) ?? asString(event.timestamp);
}

function sanitizeString(value: string, key?: string): string {
  if (key && SECRET_KEY_PATTERN.test(key)) return "[REDACTED]";
  if (BEARER_VALUE_PATTERN.test(value)) return "[REDACTED]";
  return value;
}

function sanitizeDetail(value: unknown, key?: string): ActivityDetail {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeString(value, key);
  if (Array.isArray(value)) return value.map((item) => sanitizeDetail(item));
  if (isRecord(value)) {
    const sanitized: { [key: string]: ActivityDetail } = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      sanitized[entryKey] = sanitizeDetail(entryValue, entryKey);
    }
    return sanitized;
  }
  return String(value);
}

function sanitizeRecordDetail(
  value: UnknownRecord,
  omittedKeys: readonly string[] = [],
): ActivityDetail | undefined {
  const detail: { [key: string]: ActivityDetail } = {};
  for (const [key, entry] of Object.entries(value)) {
    if (omittedKeys.includes(key)) continue;
    detail[key] = sanitizeDetail(entry, key);
  }
  return Object.keys(detail).length > 0 ? detail : undefined;
}

function summarizeToolInput(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  const filePath = asString(input.file_path);
  if (filePath) return `\`${filePath.replace(/.*\//, "")}\``;
  const command = asString(input.command);
  if (command) return `\`${normalizeWhitespace(command)}\``;
  const pattern = asString(input.pattern);
  const path = asString(input.path);
  if (pattern && path) return `\`${pattern}\` in \`${path}\``;
  if (pattern) return `\`${pattern}\``;
  const url = asString(input.url);
  if (url) return url;
  const query = asString(input.query);
  if (query) return `\`${query}\``;
  const description = asString(input.description);
  if (description) return description;
  return undefined;
}

function collectAssistantBlocks(event: UnknownRecord): AssistantContentBlock[] {
  const message = event.message;
  if (!isRecord(message) || !Array.isArray(message.content)) return [];
  return message.content.filter(isRecord) as AssistantContentBlock[];
}

function summarizeAssistantBlocks(blocks: AssistantContentBlock[]): string | undefined {
  const summaries: string[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      const text = asString(block.text);
      if (text) summaries.push(text.trim());
      continue;
    }
    if (block.type === "thinking") {
      summaries.push("Thinking…");
      continue;
    }
    if (block.type === "tool_use") {
      const toolName = asString(block.name) ?? "Tool";
      const detail = summarizeToolInput(block.input);
      summaries.push(detail ? `${toolName} ${detail}` : toolName);
    }
  }
  return summaries.length > 0 ? summaries.join(" | ") : undefined;
}

function assistantKind(blocks: AssistantContentBlock[]): ActivityKind {
  return blocks.some((block) => block.type === "tool_use") ? "tool" : "message";
}

function assistantTitle(blocks: AssistantContentBlock[]): string {
  const firstTool = blocks.find((block) => block.type === "tool_use");
  if (firstTool) {
    const toolName = asString(firstTool.name) ?? "Tool";
    return `Tool activity: ${toolName}`;
  }
  if (blocks.some((block) => block.type === "thinking")) return "Assistant thinking";
  return "Assistant message";
}

function inferSeverity(event: UnknownRecord): ActivitySeverity {
  const type = asString(event.type)?.toLowerCase() ?? "";
  if (type.includes("error") || type.includes("fail")) return "error";

  const status = asString(event.status)?.toLowerCase();
  if (status === "failed" || status === "error") return "error";
  if (status === "warning" || status === "warn") return "warn";

  const exitCode = asNumber(event.exit_code);
  if (exitCode !== undefined && exitCode !== 0) return "error";

  const item = event.item;
  if (isRecord(item)) {
    const itemStatus = asString(item.status)?.toLowerCase();
    if (itemStatus === "failed" || itemStatus === "error") return "error";
    if (itemStatus === "warning" || itemStatus === "warn") return "warn";

    const itemExitCode = asNumber(item.exit_code);
    if (itemExitCode !== undefined && itemExitCode !== 0) return "error";
  }

  return "info";
}

function buildActivityId(event: UnknownRecord, index: number): string {
  const directId = asString(event.id);
  if (directId) return directId;

  const item = event.item;
  if (isRecord(item)) {
    const itemId = asString(item.id);
    if (itemId) return itemId;
  }

  const type = asString(event.type) ?? "unknown";
  const timestamp = eventTimestamp(event) ?? String(index);
  return `${type}:${timestamp}:${index}`;
}

function collectMessageBlocks(event: UnknownRecord): MessageContentBlock[] {
  const message = event.message;
  if (!isRecord(message) || !Array.isArray(message.content)) return [];
  return message.content.filter(isRecord) as MessageContentBlock[];
}

function safeInlineCode(value: string): string {
  return value.replace(/`/g, "\\`");
}

function fencedJson(value: unknown): string {
  const json = JSON.stringify(sanitizeDetail(value), null, 2) ?? "null";
  const fence = json.includes("```") ? "````" : "```";
  return `${fence}json\n${json}\n${fence}`;
}

function blockContentToMarkdown(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (content === undefined) return "";
  return fencedJson(content);
}

function summarizeUserBlocks(blocks: MessageContentBlock[]): string | undefined {
  const summaries: string[] = [];
  for (const block of blocks) {
    const type = asString(block.type);
    if (type === "text") {
      const text = asString(block.text);
      if (text) summaries.push(normalizeWhitespace(text));
      continue;
    }
    if (type === "tool_result") {
      const id = asString(block.tool_use_id);
      const label = id ? `Tool result ${id}` : "Tool result";
      summaries.push(block.is_error ? `${label}: error` : label);
      continue;
    }
    if (type) summaries.push(toTitleCase(type));
  }
  return summaries.length > 0 ? summaries.join(" | ") : undefined;
}

function formatUserMarkdownEntry(event: UnknownRecord): Pick<ActivityMarkdownEntry, "content"> {
  const blocks = collectMessageBlocks(event);
  const parts: string[] = [];

  for (const block of blocks) {
    const type = asString(block.type);
    if (type === "text") {
      const text = asString(block.text);
      if (text) parts.push(text);
      continue;
    }

    if (type === "tool_result") {
      const id = asString(block.tool_use_id);
      const label = id ? `Tool result \`${safeInlineCode(id)}\`` : "Tool result";
      const content = blockContentToMarkdown(block.content);
      parts.push(content ? `**${label}:**${block.is_error === true ? " _error_" : ""}\n\n${content}` : `**${label}:**${block.is_error === true ? " _error_" : ""}`);
      continue;
    }

    if (type) {
      parts.push(`**${toTitleCase(type)}:**\n\n${fencedJson(block)}`);
    }
  }

  const summary = parts.length > 0 ? parts.join("\n\n") : "**User event**";
  return { content: summary };
}

function formatUserMarkdown(event: UnknownRecord): string {
  return formatUserMarkdownEntry(event).content;
}

function normalizeItemEvent(event: UnknownRecord, index: number): ActivityItem {
  const item = isRecord(event.item) ? event.item : undefined;
  const itemType = item ? asString(item.type) : undefined;
  const eventType = asString(event.type);
  const status = eventType?.endsWith(".completed")
    ? "completed"
    : eventType?.endsWith(".started")
      ? "started"
      : eventType?.endsWith(".failed")
        ? "failed"
        : undefined;

  if (itemType === "agent_message") {
    const text = item ? asString(item.text) : undefined;
    return {
      id: buildActivityId(event, index),
      kind: "message",
      timestamp: asString(event.at),
      actor: "Codex",
      title: status ? `Agent message ${status}` : "Agent message",
      summary: text ?? undefined,
      detail: item ? sanitizeRecordDetail(item, ["text"]) : undefined,
      raw: event,
      severity: inferSeverity(event),
    };
  }

  if (itemType === "command_execution") {
    const command = item ? asString(item.command) : undefined;
    const aggregatedOutput = item ? asString(item.aggregated_output) : undefined;
    return {
      id: buildActivityId(event, index),
      kind: "command",
      timestamp: asString(event.at),
      actor: "Command",
      title: status ? `Command ${status}` : "Command execution",
      summary: command
        ? normalizeWhitespace(command)
        : aggregatedOutput
          ? normalizeWhitespace(aggregatedOutput)
          : undefined,
      detail: item ? sanitizeRecordDetail(item, ["command", "aggregated_output"]) : undefined,
      raw: event,
      severity: inferSeverity(event),
    };
  }

  return {
    id: buildActivityId(event, index),
    kind: itemType === "tool_use" ? "tool" : "unknown",
    timestamp: asString(event.at),
    actor: itemType ? toTitleCase(itemType) : "Item",
    title: status
      ? `${toTitleCase(itemType ?? "item")} ${status}`
      : toTitleCase(itemType ?? "item"),
    summary: item ? JSON.stringify(sanitizeDetail(item)) : undefined,
    detail: item ? sanitizeRecordDetail(item) : undefined,
    raw: event,
    severity: inferSeverity(event),
  };
}

export function normalizeActivityEvent(event: unknown, index = 0): ActivityItem {
  if (!isRecord(event)) {
    return {
      id: `unknown:${index}`,
      kind: "unknown",
      title: "Unknown event",
      detail: sanitizeDetail(event),
      raw: event,
      severity: "warn",
    };
  }

  const type = asString(event.type) ?? "unknown";
  const timestamp = eventTimestamp(event);
  const severity = inferSeverity(event);

  if (type === "system") {
    return {
      id: buildActivityId(event, index),
      kind: "system",
      timestamp,
      actor: asString(event.source),
      title: asString(event.message) ?? "System event",
      summary: asString(event.code) ?? asString(event.phaseName),
      detail: sanitizeRecordDetail(event, ["type", "at", "source", "message"]),
      raw: event,
      severity,
    };
  }

  if (type === "_tribe.run_start") {
    return {
      id: buildActivityId(event, index),
      kind: "run",
      timestamp,
      title: "Run started",
      summary: event.resumeSessionId ? `Resumed session ${String(event.resumeSessionId)}` : undefined,
      detail: sanitizeRecordDetail(event, ["type", "at"]),
      raw: event,
      severity,
    };
  }

  if (type === "thread.started") {
    return {
      id: buildActivityId(event, index),
      kind: "run",
      timestamp,
      title: "Thread started",
      summary: asString(event.thread_id),
      detail: sanitizeRecordDetail(event, ["type", "thread_id"]),
      raw: event,
      severity,
    };
  }

  if (type === "turn.started" || type === "turn.completed") {
    return {
      id: buildActivityId(event, index),
      kind: "run",
      timestamp,
      title: type === "turn.started" ? "Turn started" : "Turn completed",
      detail: sanitizeRecordDetail(event, ["type", "at"]),
      raw: event,
      severity,
    };
  }

  if (type === "user_message") {
    const text = asString(event.text);
    return {
      id: buildActivityId(event, index),
      kind: "message",
      timestamp,
      actor: "You",
      title: "User message",
      summary: text?.trim() || undefined,
      detail: sanitizeRecordDetail(event, ["type", "at", "text"]),
      raw: event,
      severity,
    };
  }

  if (type === "user") {
    const blocks = collectMessageBlocks(event);
    return {
      id: buildActivityId(event, index),
      kind: "message",
      timestamp,
      actor: "You",
      title: blocks.some((block) => block.type === "tool_result") ? "User tool result" : "User message",
      summary: summarizeUserBlocks(blocks),
      detail: sanitizeRecordDetail(event, ["type", "at", "timestamp"]),
      raw: event,
      severity,
    };
  }

  if (type === "raw") {
    const text = asString(event.text);
    return {
      id: buildActivityId(event, index),
      kind: "raw",
      timestamp,
      title: "Raw output",
      summary: text ? text.trim() : undefined,
      detail: sanitizeRecordDetail(event, ["type", "at", "text"]),
      raw: event,
      severity,
    };
  }

  if (type === "result") {
    const result = asString(event.result);
    return {
      id: buildActivityId(event, index),
      kind: "result",
      timestamp,
      title: "Result",
      summary: result ? result.trim() : undefined,
      detail: sanitizeRecordDetail(event, ["type", "at", "result"]),
      raw: event,
      severity,
    };
  }

  if (type === "assistant") {
    const blocks = collectAssistantBlocks(event);
    return {
      id: buildActivityId(event, index),
      kind: assistantKind(blocks),
      timestamp,
      actor: "Codex",
      title: assistantTitle(blocks),
      summary: summarizeAssistantBlocks(blocks),
      detail: sanitizeRecordDetail(event, ["type", "at"]),
      raw: event,
      severity,
    };
  }

  if (type.startsWith("item.")) {
    return normalizeItemEvent(event, index);
  }

  return {
    id: buildActivityId(event, index),
    kind: "unknown",
    timestamp,
    title: toTitleCase(type),
    summary: asString(event.message),
    detail: sanitizeRecordDetail(event, ["type", "at", "message"]),
    raw: event,
    severity,
  };
}

export function isDisplayableActivityItem(_item: ActivityItem): boolean {
  return true;
}

export function normalizeActivityEvents(events: unknown[]): ActivityItem[] {
  return events
    .map((event, index) => normalizeActivityEvent(event, index))
    .filter(isDisplayableActivityItem);
}

export const ACTIVITY_RENDER_EVENT_LIMIT = 200;
export const ACTIVITY_RENDER_BYTE_LIMIT = 128 * 1024;

export function estimateEventPayloadBytes(event: unknown): number {
  try {
    return JSON.stringify(event)?.length ?? String(event).length;
  } catch {
    return String(event).length;
  }
}

export function selectRecentActivityEvents(
  historicalEvents: unknown[],
  liveEvents: unknown[],
  maxItems = ACTIVITY_RENDER_EVENT_LIMIT,
): { events: unknown[]; totalCount: number } {
  const totalCount = historicalEvents.length + liveEvents.length;
  if (totalCount <= maxItems) return { events: historicalEvents.concat(liveEvents), totalCount };
  const liveWindow = liveEvents.slice(-maxItems);
  const remainingHistory = Math.max(maxItems - liveWindow.length, 0);
  return { events: [...historicalEvents.slice(-remainingHistory), ...liveWindow], totalCount };
}

export function getActivityMarkdownEntries(
  events: unknown[],
  maxBytes = ACTIVITY_RENDER_BYTE_LIMIT,
): ActivityMarkdownEntry[] {
  const entries: ActivityMarkdownEntry[] = [];
  let totalBytes = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const userEntry = isRecord(event) && asString(event.type) === "user" ? formatUserMarkdownEntry(event) : undefined;
    const activityItem = normalizeActivityEvent(event, index);
    if (!isDisplayableActivityItem(activityItem)) continue;
    const content = (userEntry?.content ?? extractEventText(event)).trim();
    if (!content) continue;
    const nextBytes = totalBytes + content.length;
    if (entries.length > 0 && nextBytes > maxBytes) break;
    const typeOption = getActivityTypeOption(event, activityItem);
    entries.push({
      id: `${activityItem.id}:${index}`,
      content,
      tone: getActivityTone(event, activityItem),
      severity: activityItem.severity,
      subtypeLabel: typeOption.label,
      typeKey: typeOption.key,
    });
    totalBytes = nextBytes;
  }
  return entries.reverse();
}

export function getActivityTypeOption(event: unknown, item?: ActivityItem): ActivityTypeOption {
  const activityItem = item ?? normalizeActivityEvent(event);
  const label = getActivitySubtypeLabel(event, activityItem);
  return { key: activityTypeKey(label), label };
}

function getActivitySubtypeLabel(event: unknown, item: ActivityItem): string {
  if (!isRecord(event)) return "UNKNOWN";

  const type = asString(event.type);
  if (type === "user") {
    return collectMessageBlocks(event).some((block) => block.type === "tool_result") ? "TOOL RESULT" : "USER";
  }
  if (type === "user_message") return "USER";
  if (type === "assistant") {
    return collectAssistantBlocks(event).some((block) => block.type === "tool_use") ? "TOOL USE" : "ASSISTANT";
  }
  if (type === "system") return "SYSTEM";
  if (type === "raw") return "RAW";
  if (type === "result") return "RESULT";
  if (type === "_tribe.run_start" || type === "thread.started" || type === "turn.started" || type === "turn.completed") return "RUN";

  const eventItem = event.item;
  if (isRecord(eventItem)) {
    const itemType = asString(eventItem.type);
    if (itemType === "command_execution") return "COMMAND";
    if (itemType === "tool_use") return "TOOL USE";
    if (itemType === "agent_message") return "ASSISTANT";
    return "ITEM";
  }

  if (item.kind === "command") return "COMMAND";
  if (item.kind === "run") return "RUN";
  if (item.kind === "tool") return "TOOL USE";
  if (item.kind === "system") return "SYSTEM";
  if (item.kind === "raw") return "RAW";
  if (item.kind === "result") return "RESULT";
  return "UNKNOWN";
}

function getActivityTone(_event: unknown, _item: ActivityItem): ActivityTone {
  return "primary";
}

function formatAssistantMarkdown(blocks: AssistantContentBlock[]): string {
  const textBlocks: string[] = [];
  const toolLines: string[] = [];

  for (const block of blocks) {
    if (block.type === "text") {
      const text = asString(block.text);
      if (text) textBlocks.push(text);
    } else if (block.type === "thinking") {
      toolLines.push("_Thinking…_");
    } else if (block.type === "tool_use") {
      const toolName = asString(block.name) ?? "Tool";
      const detail = summarizeToolInput(block.input);
      toolLines.push(detail ? `🔧 _${toolName}_ ${detail}` : `🔧 _${toolName}_`);
    }
  }

  const parts: string[] = [];
  if (textBlocks.length > 0) parts.push(textBlocks.join("\n\n"));
  if (toolLines.length > 0) parts.push(toolLines.join(" · "));
  return parts.join("\n\n");
}

export function extractEventText(event: unknown): string {
  const item = normalizeActivityEvent(event);
  if (item.kind === "system") {
    const time = formatTime(item.timestamp);
    const actor = item.actor ?? "System";
    return `**${actor}${time ? ` ${time}` : ""}:** ${item.title}`;
  }
  if (isRecord(event) && asString(event.type) === "assistant") {
    const markdown = formatAssistantMarkdown(collectAssistantBlocks(event));
    if (markdown) return markdown;
  }
  if (isRecord(event) && asString(event.type) === "user") {
    return formatUserMarkdown(event);
  }
  if (item.kind === "message" && item.actor === "You" && item.summary) {
    return `**You:** ${item.summary}`;
  }
  if ((item.kind === "raw" || item.kind === "result") && item.summary) {
    return item.summary;
  }
  if (item.kind === "command") {
    return item.summary ? `🔧 _${item.title}_ ${item.summary}` : `🔧 _${item.title}_`;
  }
  return item.summary ?? item.title;
}

export const extractAssistantText = extractEventText;
