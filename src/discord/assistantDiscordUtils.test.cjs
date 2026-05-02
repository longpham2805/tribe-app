require("ts-node/register");

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAssistantMessageButtonsForDiscord,
  chunkDiscordText,
  classifyDiscordInboundMessage,
  formatAssistantActionForDiscord,
  formatAssistantMessageForDiscord,
  formatAssistantMessagePayloadForDiscord,
  parseDiscordAssistantCommand,
  shouldMirrorAssistantMessageToDiscord,
} = require("./assistantDiscordUtils");

test("parseDiscordAssistantCommand handles fallback actions", () => {
  assert.deepEqual(parseDiscordAssistantCommand("!tribe actions", "!tribe"), { type: "list_actions" });
  assert.deepEqual(parseDiscordAssistantCommand("!tribe approve 42", "!tribe"), { type: "approve", actionId: 42 });
  assert.deepEqual(parseDiscordAssistantCommand("!tribe reject 7", "!tribe"), { type: "reject", actionId: 7 });
  assert.equal(parseDiscordAssistantCommand("hello tribe", "!tribe"), null);
  assert.equal(parseDiscordAssistantCommand("!tribex actions", "!tribe"), null);
  assert.deepEqual(parseDiscordAssistantCommand("!tribe approve", "!tribe"), {
    type: "help",
    error: "Expected an action id after approve.",
  });
});

test("classifyDiscordInboundMessage enforces thread, bot, age, command, prompt, and attachment rules", () => {
  const base = {
    channelId: "thread-1",
    content: "hello",
    authorBot: false,
    webhookId: null,
    createdTimestamp: 2000,
    attachmentCount: 0,
  };
  const opts = { threadId: "thread-1", prefix: "!tribe", startedAtMs: 1000 };

  assert.deepEqual(classifyDiscordInboundMessage({ ...base, channelId: "other" }, opts), { kind: "ignore", reason: "wrong_thread" });
  assert.deepEqual(classifyDiscordInboundMessage({ ...base, authorBot: true }, opts), { kind: "ignore", reason: "bot" });
  assert.deepEqual(classifyDiscordInboundMessage({ ...base, webhookId: "webhook-1" }, opts), { kind: "ignore", reason: "webhook" });
  assert.deepEqual(classifyDiscordInboundMessage({ ...base, createdTimestamp: 999 }, opts), { kind: "ignore", reason: "old" });
  assert.deepEqual(classifyDiscordInboundMessage({ ...base, content: "!tribe actions" }, opts), { kind: "command", command: { type: "list_actions" } });
  assert.deepEqual(classifyDiscordInboundMessage({ ...base, content: "  hello  " }, opts), { kind: "prompt", content: "hello" });
  assert.deepEqual(classifyDiscordInboundMessage({ ...base, content: "", attachmentCount: 1 }, opts), { kind: "attachment_only" });
});

test("chunkDiscordText stays within Discord limits", () => {
  const text = "x".repeat(4500);
  const chunks = chunkDiscordText(text);
  assert.equal(chunks.length, 3);
  assert.ok(chunks.every((chunk) => chunk.length <= 2000));
  assert.equal(chunks.join(""), text);
});

test("formatAssistantMessageForDiscord flattens context embeds", () => {
  const text = formatAssistantMessageForDiscord({
    id: 1,
    role: "assistant",
    content: "Ready to ship.",
    ticketId: 12,
    phaseId: null,
    severity: "warn",
    readAt: null,
    sourceEventKey: null,
    metadata: null,
    embeds: [
      { type: "ticket", ticketId: 12, title: "Discord sync", phase: "SHIP" },
      { type: "pull_request", ticketId: 12, url: "https://github.com/org/repo/pull/12", number: 12 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert.match(text, /Tribe assistant \(WARN, ticket #12\)/);
  assert.match(text, /Ready to ship\./);
  assert.match(text, /Ticket #12: Discord sync \(SHIP\)/);
  assert.match(text, /PR #12 for ticket #12/);
});

const assistantMessageBase = {
  id: 1,
  role: "assistant",
  content: "Ready to ship.",
  ticketId: 12,
  phaseId: null,
  severity: "info",
  readAt: null,
  sourceEventKey: null,
  metadata: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test("formatAssistantMessagePayloadForDiscord adds safe PR buttons", () => {
  const payload = formatAssistantMessagePayloadForDiscord({
    ...assistantMessageBase,
    embeds: [
      { type: "pull_request", ticketId: 12, url: "https://github.com/org/repo/pull/12", number: 12 },
    ],
  });

  assert.match(payload.content, /PR #12 for ticket #12/);
  assert.deepEqual(payload.buttons, [
    { label: "Open PR #12", url: "https://github.com/org/repo/pull/12" },
  ]);
  assert.equal(payload.componentLayout.accentColor, 0x57f287);
  assert.match(payload.componentLayout.header, /Tribe assistant/);
  assert.match(payload.componentLayout.body, /Ready to ship\./);
  assert.match(payload.componentLayout.context, /PR #12 for ticket #12/);
  assert.doesNotMatch(payload.componentLayout.context, /https:\/\/github\.com/);
});

test("formatAssistantMessagePayloadForDiscord skips component layout for oversized bodies", () => {
  const payload = formatAssistantMessagePayloadForDiscord({
    ...assistantMessageBase,
    content: "x".repeat(3401),
    embeds: null,
  });

  assert.equal(payload.componentLayout, null);
});

test("buildAssistantMessageButtonsForDiscord skips unsafe and duplicate PR urls", () => {
  const buttons = buildAssistantMessageButtonsForDiscord([
    { type: "pull_request", url: "http://github.com/org/repo/pull/1", number: 1 },
    { type: "pull_request", url: "notaurl", number: 2 },
    { type: "pull_request", url: "https://github.com/org/repo/pull/3", number: 3 },
    { type: "pull_request", url: "https://github.com/org/repo/pull/3", number: 3 },
  ]);

  assert.deepEqual(buttons, [
    { label: "Open PR #3", url: "https://github.com/org/repo/pull/3" },
  ]);
});

test("shouldMirrorAssistantMessageToDiscord suppresses Discord-origin user echo only", () => {
  const createdAt = new Date(2000).toISOString();
  const base = {
    id: 1,
    content: "hello",
    ticketId: null,
    phaseId: null,
    severity: "info",
    readAt: null,
    sourceEventKey: null,
    embeds: null,
    createdAt,
    updatedAt: createdAt,
  };

  assert.equal(shouldMirrorAssistantMessageToDiscord({ ...base, role: "user", metadata: { origin: "discord" } }, 1000), false);
  assert.equal(shouldMirrorAssistantMessageToDiscord({ ...base, role: "assistant", metadata: { origin: "discord" } }, 1000), true);
  assert.equal(shouldMirrorAssistantMessageToDiscord({ ...base, role: "user", metadata: { origin: "tribe_ui" } }, 1000), true);
  assert.equal(shouldMirrorAssistantMessageToDiscord({ ...base, role: "assistant", metadata: null, createdAt: new Date(500).toISOString() }, 1000), false);
});

test("formatAssistantActionForDiscord marks stale actions", () => {
  const action = {
    id: 99,
    type: "TRIGGER_PHASE",
    status: "executed",
    payload: { ticketId: 123, phaseName: "SHIP" },
    reason: "User approved",
    confidence: null,
    source: "chat",
    fingerprint: null,
    ticketId: null,
    messageId: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const text = formatAssistantActionForDiscord(action);
  assert.match(text, /Tribe action #99 executed/);
  assert.match(text, /TRIGGER PHASE/);
  assert.match(text, /Ticket: #123/);
});
