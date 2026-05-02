require("ts-node/register");

const test = require("node:test");
const assert = require("node:assert/strict");
const { DiscordAssistantBridgeService } = require("./DiscordAssistantBridgeService");

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "test-key";

function createSyncRepo() {
  const rows = [];
  return {
    rows,
    async create(data) {
      rows.push({ id: rows.length + 1, ...data });
      return rows[rows.length - 1];
    },
    async existsForEntity(entityType, entityId, discordChannelId, direction) {
      return rows.some((row) =>
        row.entityType === entityType &&
        row.entityId === entityId &&
        row.discordChannelId === discordChannelId &&
        row.direction === direction
      );
    },
    async findForEntity(entityType, entityId, discordChannelId, direction) {
      return rows.find((row) =>
        row.entityType === entityType &&
        row.entityId === entityId &&
        row.discordChannelId === discordChannelId &&
        row.direction === direction
      ) ?? null;
    },
    async existsByDiscordMessageId(discordMessageId) {
      return rows.some((row) => row.discordMessageId === discordMessageId);
    },
  };
}

function createThread() {
  const sent = [];
  const edits = [];
  return {
    sent,
    edits,
    id: "thread-1",
    async send(options) {
      const message = { id: `sent-${sent.length + 1}`, options };
      sent.push(message);
      return message;
    },
    messages: {
      async fetch(id) {
        return {
          id,
          async edit(options) {
            edits.push({ id, options });
          },
        };
      },
    },
  };
}

function createService(overrides = {}) {
  const thread = overrides.thread ?? createThread();
  const syncRepo = overrides.syncRepo ?? createSyncRepo();
  const actionState = overrides.actionState ?? {
    id: 9,
    type: "TRIGGER_PHASE",
    status: "proposed",
    payload: { ticketId: 123, phaseName: "SHIP" },
    reason: "Needs approval",
    confidence: null,
    source: "chat",
    fingerprint: null,
    ticketId: 123,
    messageId: null,
    errorMessage: null,
    createdAt: new Date(2000),
    updatedAt: new Date(2000),
  };
  const actionRepo = overrides.actionRepo ?? {
    async findPending() { return actionState.status === "proposed" ? [actionState] : []; },
    async findById(id) { return id === actionState.id ? actionState : null; },
    async updateStatus(id, status) {
      if (id === actionState.id) actionState.status = status;
    },
  };
  const agentCalls = [];
  const agent = overrides.agent ?? {
    calls: agentCalls,
    async handleUserMessage(opts) {
      agentCalls.push(opts);
      await opts.onUserMessageCreated?.({
        id: 77,
        role: "user",
        content: opts.message,
        ticketId: null,
        phaseId: null,
        severity: "info",
        readAt: null,
        sourceEventKey: null,
        metadata: opts.metadata,
        embeds: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return "assistant reply";
    },
    async executeApprovedAction(id) {
      agentCalls.push({ approve: id });
      return { success: true };
    },
  };
  const client = overrides.client ?? {
    on() {},
    once() {},
    user: { tag: "test-bot" },
    channels: { async fetch() { return { ...thread, isTextBased: () => true }; } },
  };
  const service = new DiscordAssistantBridgeService({
    token: "token",
    threadId: "thread-1",
    commandPrefix: "!tribe",
    messageContentIntentEnabled: overrides.messageContentIntentEnabled ?? true,
    startedAtMs: 1000,
    client,
    agent,
    actionRepo,
    syncRepo,
  });
  return { service, thread, syncRepo, actionRepo, actionState, agent, agentCalls };
}

function createDiscordMessage(overrides = {}) {
  const replies = [];
  const channelSends = [];
  return {
    id: "discord-1",
    channelId: "thread-1",
    content: "hello from discord",
    author: { bot: false, id: "user-1", username: "long", globalName: "Long" },
    member: { displayName: "Long Nguyen" },
    webhookId: null,
    createdTimestamp: 2000,
    attachments: { size: 0 },
    replies,
    channelSends,
    async reply(options) { replies.push(options); },
    channel: { async send(options) { channelSends.push(options); } },
    ...overrides,
  };
}

test("Discord inbound prompt creates a Tribe assistant message mapping", async () => {
  const { service, syncRepo, agentCalls } = createService();
  const message = createDiscordMessage();

  await service.handleDiscordMessage(message);

  assert.equal(agentCalls.length, 1);
  assert.equal(agentCalls[0].message, "hello from discord");
  assert.equal(agentCalls[0].metadata.origin, "discord");
  assert.equal(agentCalls[0].metadata.discord.authorDisplayName, "Long Nguyen");
  assert.deepEqual(syncRepo.rows[0], {
    id: 1,
    entityType: "message",
    entityId: 77,
    discordChannelId: "thread-1",
    discordMessageId: "discord-1",
    direction: "discord_to_tribe",
  });
});

test("Discord inbound messages are ignored when MessageContent intent is disabled", async () => {
  const { service, agentCalls } = createService({ messageContentIntentEnabled: false });
  const message = createDiscordMessage();

  await service.handleDiscordMessage(message);

  assert.equal(agentCalls.length, 0);
  assert.equal(message.replies.length, 0);
});

test("Discord fallback commands list, approve, and reject actions", async () => {
  const { service, actionState, agentCalls } = createService();

  const listMessage = createDiscordMessage({ content: "!tribe actions" });
  await service.handleDiscordMessage(listMessage);
  assert.match(listMessage.replies[0].content, /#9 - TRIGGER PHASE ticket #123/);

  const approveMessage = createDiscordMessage({ content: "!tribe approve 9" });
  await service.handleDiscordMessage(approveMessage);
  assert.deepEqual(agentCalls.at(-1), { approve: 9 });
  assert.match(approveMessage.replies[0].content, /Approved and executed/);

  actionState.status = "proposed";
  const rejectMessage = createDiscordMessage({ content: "!tribe reject 9" });
  await service.handleDiscordMessage(rejectMessage);
  assert.equal(actionState.status, "rejected");
  assert.match(rejectMessage.replies[0].content, /Rejected Tribe action #9/);
});

test("assistant messages mirror outbound once with allowed mentions disabled", async () => {
  const { service, thread, syncRepo } = createService();
  const assistantMessage = {
    id: 51,
    role: "assistant",
    content: "Do not ping @everyone",
    ticketId: null,
    phaseId: null,
    severity: "info",
    readAt: null,
    sourceEventKey: null,
    metadata: null,
    embeds: null,
    createdAt: new Date(2000).toISOString(),
    updatedAt: new Date(2000).toISOString(),
  };

  await service.mirrorAssistantMessage(assistantMessage);
  await service.mirrorAssistantMessage(assistantMessage);

  assert.equal(thread.sent.length, 1);
  assert.equal(thread.sent[0].options.allowedMentions.parse.length, 0);
  assert.equal(syncRepo.rows[0].direction, "tribe_to_discord");
});

test("proposed actions mirror with buttons and stale action updates edit the Discord message", async () => {
  const { service, thread, actionState } = createService();

  await service.mirrorAssistantAction(actionState);
  assert.equal(thread.sent.length, 1);
  assert.match(thread.sent[0].options.content, /Pending Tribe action #9/);
  assert.equal(thread.sent[0].options.components.length, 1);

  actionState.status = "executed";
  await service.mirrorAssistantAction(actionState);
  assert.equal(thread.edits.length, 1);
  assert.match(thread.edits[0].options.content, /Tribe action #9 executed/);
  assert.equal(thread.edits[0].options.components.length, 1);
});

test("Discord action buttons approve through the assistant service", async () => {
  const { service, agentCalls } = createService();
  const replies = [];
  const interaction = {
    isButton: () => true,
    customId: "tribe:assistant_action:approve:9",
    channelId: "thread-1",
    async reply(options) { replies.push(options); },
  };

  await service.handleDiscordInteraction(interaction);

  assert.deepEqual(agentCalls.at(-1), { approve: 9 });
  assert.match(replies[0].content, /Approved and executed/);
  assert.equal(replies[0].ephemeral, true);
});
