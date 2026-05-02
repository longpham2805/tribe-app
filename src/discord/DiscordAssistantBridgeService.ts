import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
  type Message,
  type MessageCreateOptions,
  type MessageEditOptions,
} from "discord.js";
import { AssistantAgentService } from "../assistant/AssistantAgentService";
import { AssistantActionRepository } from "../assistant/AssistantRepository";
import type { AssistantAction } from "../entity/AssistantAction";
import type { AssistantMessage, AssistantMessageMetadata } from "../entity/AssistantMessage";
import { emit, subscribe, type TribeEvent } from "../lib/events";
import { AppStateRepository, normalizeNullableSetting } from "../repository/AppStateRepository";
import { DiscordAssistantSyncRepository } from "./DiscordAssistantSyncRepository";
import {
  chunkDiscordText,
  classifyDiscordInboundMessage,
  formatAssistantActionForDiscord,
  formatAssistantMessageForDiscord,
  formatPendingActionsForDiscord,
  shouldMirrorAssistantMessageToDiscord,
  type DiscordAssistantCommand,
} from "./assistantDiscordUtils";

const DEFAULT_COMMAND_PREFIX = "!tribe";
const ACTION_CUSTOM_ID_PREFIX = "tribe:assistant_action";
const DISCORD_ALLOWED_MENTIONS = { parse: [] as never[], repliedUser: false };

type DiscordThreadLike = {
  id: string;
  send(options: MessageCreateOptions): Promise<{ id: string }>;
  messages: {
    fetch(id: string): Promise<{ edit(options: MessageEditOptions): Promise<unknown> }>;
  };
};

type ActionOperation = "approve" | "reject";
type DiscordSettingsSource = "settings" | "env" | "mixed" | "none";
type DiscordSettings = { token: string | null; threadId: string | null };
type DiscordSettingsResolver = () => Promise<DiscordSettings>;

const log = (message: string) => console.log(`[DiscordAssistantBridge] ${message}`);

export class DiscordAssistantBridgeService {
  private client: Client;
  private agent: AssistantAgentService;
  private actionRepo: AssistantActionRepository;
  private syncRepo: DiscordAssistantSyncRepository;
  private token: string | null;
  private threadId: string | null;
  private hasExplicitDiscordSettings: boolean;
  private settingsResolver: DiscordSettingsResolver;
  private commandPrefix: string;
  private messageContentIntentEnabled: boolean;
  private startedAtMs: number;
  private thread: DiscordThreadLike | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(opts?: {
    token?: string | null;
    threadId?: string | null;
    commandPrefix?: string;
    messageContentIntentEnabled?: boolean;
    startedAtMs?: number;
    client?: Client;
    agent?: AssistantAgentService;
    actionRepo?: AssistantActionRepository;
    syncRepo?: DiscordAssistantSyncRepository;
    settingsResolver?: DiscordSettingsResolver;
  }) {
    this.token = normalizeNullableSetting(opts?.token);
    this.threadId = normalizeNullableSetting(opts?.threadId);
    this.hasExplicitDiscordSettings = opts?.token !== undefined || opts?.threadId !== undefined;
    this.settingsResolver = opts?.settingsResolver ?? getStoredDiscordSettings;
    this.commandPrefix = opts?.commandPrefix ?? process.env.DISCORD_COMMAND_PREFIX?.trim() ?? DEFAULT_COMMAND_PREFIX;
    this.messageContentIntentEnabled = opts?.messageContentIntentEnabled ?? readBooleanEnv(process.env.DISCORD_ENABLE_MESSAGE_CONTENT_INTENT);
    this.startedAtMs = opts?.startedAtMs ?? Date.now();
    this.client = opts?.client ?? new Client({ intents: this.buildGatewayIntents() });
    this.agent = opts?.agent ?? new AssistantAgentService();
    this.actionRepo = opts?.actionRepo ?? new AssistantActionRepository();
    this.syncRepo = opts?.syncRepo ?? new DiscordAssistantSyncRepository();
  }

  async start(): Promise<void> {
    const settings = await this.resolveEffectiveDiscordSettings();
    this.token = settings.token;
    this.threadId = settings.threadId;

    if (!this.token || !this.threadId) {
      log("disabled; configure discordBotToken and discordAssistantThreadId in settings, or set DISCORD_BOT_TOKEN and DISCORD_ASSISTANT_THREAD_ID env vars");
      return;
    }
    if (!this.messageContentIntentEnabled) {
      log("MessageContent intent disabled; outbound sync and action buttons are enabled, but Discord free-text prompts and prefix commands are ignored. Set DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=true and enable Message Content Intent in the Discord Developer Portal to sync every thread message.");
    }

    this.registerDiscordHandlers();
    this.unsubscribe = subscribe((event) => {
      this.handleTribeEvent(event).catch((err) => log(`Tribe event sync failed: ${err?.message ?? err}`));
    });

    try {
      this.client.once(Events.ClientReady, async () => {
        await this.resolveThread();
        log(`connected as ${this.client.user?.tag ?? "Discord bot"}; syncing thread ${this.threadId}; config source ${settings.source}`);
      });
      await this.client.login(this.token);
    } catch (err: any) {
      this.unsubscribe?.();
      this.unsubscribe = null;
      log(`failed to start: ${err?.message ?? err}`);
    }
  }

  private async resolveEffectiveDiscordSettings(): Promise<DiscordSettings & { source: DiscordSettingsSource }> {
    const explicitSettings = this.hasExplicitDiscordSettings
      ? { token: this.token, threadId: this.threadId }
      : null;
    const resolvedSettings = explicitSettings ?? await this.settingsResolver().catch((err) => {
      log(`settings lookup failed; falling back to env: ${err?.message ?? err}`);
      return { token: null, threadId: null };
    });
    const storedSettings = normalizeDiscordSettings(resolvedSettings);
    const envSettings = {
      token: normalizeNullableSetting(process.env.DISCORD_BOT_TOKEN),
      threadId: normalizeNullableSetting(process.env.DISCORD_ASSISTANT_THREAD_ID),
    };
    const token = storedSettings.token ?? envSettings.token;
    const threadId = storedSettings.threadId ?? envSettings.threadId;

    return {
      token,
      threadId,
      source: getDiscordSettingsSource(storedSettings, envSettings, token, threadId),
    };
  }

  private registerDiscordHandlers(): void {
    this.client.on(Events.MessageCreate, (message) => {
      this.handleDiscordMessage(message).catch((err) => log(`message handler failed: ${err?.message ?? err}`));
    });
    this.client.on(Events.InteractionCreate, (interaction) => {
      this.handleDiscordInteraction(interaction).catch((err) => log(`interaction handler failed: ${err?.message ?? err}`));
    });
  }

  private buildGatewayIntents(): GatewayIntentBits[] {
    const intents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ];
    if (this.messageContentIntentEnabled) {
      intents.push(GatewayIntentBits.MessageContent);
    }
    return intents;
  }

  private async resolveThread(): Promise<DiscordThreadLike | null> {
    if (!this.threadId) return null;
    if (this.thread) return this.thread;

    const channel = await this.client.channels.fetch(this.threadId).catch((err) => {
      log(`failed to fetch configured thread ${this.threadId}: ${err?.message ?? err}`);
      return null;
    });

    if (!channel || !channel.isTextBased() || typeof (channel as any).send !== "function") {
      log(`configured Discord thread ${this.threadId} is not a sendable text channel`);
      return null;
    }

    this.thread = channel as unknown as DiscordThreadLike;
    return this.thread;
  }

  private async handleTribeEvent(event: TribeEvent): Promise<void> {
    if (!this.threadId) return;

    if (event.type === "assistant.message.created") {
      const message = asAssistantMessage(event.message);
      if (message) await this.mirrorAssistantMessage(message);
      return;
    }

    if (event.type === "assistant.action.updated") {
      const action = asAssistantAction(event.action);
      if (action) await this.mirrorAssistantAction(action);
    }
  }

  private async mirrorAssistantMessage(message: AssistantMessage): Promise<void> {
    if (!this.threadId || !shouldMirrorAssistantMessageToDiscord(message, this.startedAtMs)) return;
    const alreadySynced = await this.syncRepo.existsForEntity("message", message.id, this.threadId, "tribe_to_discord");
    if (alreadySynced) return;

    const thread = await this.resolveThread();
    if (!thread) return;

    const chunks = chunkDiscordText(formatAssistantMessageForDiscord(message));
    let firstDiscordMessageId: string | null = null;

    for (const chunk of chunks) {
      const sent = await thread.send({ content: chunk, allowedMentions: DISCORD_ALLOWED_MENTIONS });
      firstDiscordMessageId ??= sent.id;
    }

    if (!firstDiscordMessageId) return;
    await this.createSyncSafe({
      entityType: "message",
      entityId: message.id,
      discordChannelId: this.threadId,
      discordMessageId: firstDiscordMessageId,
      direction: "tribe_to_discord",
    });
  }

  private async mirrorAssistantAction(action: AssistantAction): Promise<void> {
    if (!this.threadId) return;
    const existing = await this.syncRepo.findForEntity("action", action.id, this.threadId, "tribe_to_discord");

    if (action.status === "proposed") {
      if (new Date(action.createdAt).getTime() < this.startedAtMs || existing) return;
      const thread = await this.resolveThread();
      if (!thread) return;
      const sent = await thread.send({
        content: formatAssistantActionForDiscord(action),
        components: this.buildActionComponents(action.id, false),
        allowedMentions: DISCORD_ALLOWED_MENTIONS,
      });
      await this.createSyncSafe({
        entityType: "action",
        entityId: action.id,
        discordChannelId: this.threadId,
        discordMessageId: sent.id,
        direction: "tribe_to_discord",
      });
      return;
    }

    if (!existing) return;
    const thread = await this.resolveThread();
    if (!thread) return;
    const discordMessage = await thread.messages.fetch(existing.discordMessageId).catch(() => null);
    if (!discordMessage) return;
    await discordMessage.edit({
      content: formatAssistantActionForDiscord(action),
      components: this.buildActionComponents(action.id, true),
      allowedMentions: DISCORD_ALLOWED_MENTIONS,
    });
  }

  private async handleDiscordMessage(message: Message): Promise<void> {
    if (!this.threadId) return;
    if (!this.messageContentIntentEnabled) return;
    const decision = classifyDiscordInboundMessage({
      channelId: message.channelId,
      content: message.content ?? "",
      authorBot: message.author?.bot,
      webhookId: message.webhookId,
      createdTimestamp: message.createdTimestamp,
      attachmentCount: message.attachments?.size ?? 0,
    }, {
      threadId: this.threadId,
      prefix: this.commandPrefix,
      startedAtMs: this.startedAtMs,
    });

    if (decision.kind === "ignore") return;
    if (decision.kind === "attachment_only") {
      await this.replyToDiscordMessage(message, "Please send text for the Tribe assistant. Attachments are not synced yet.");
      return;
    }
    if (decision.kind === "command") {
      await this.handleDiscordCommand(decision.command, message);
      return;
    }

    const alreadySynced = await this.syncRepo.existsByDiscordMessageId(message.id);
    if (alreadySynced) return;

    const metadata = this.buildDiscordMetadata(message);
    const reply = await this.agent.handleUserMessage({
      message: decision.content,
      metadata,
      onUserMessageCreated: async (assistantMessage) => {
        await this.createSyncSafe({
          entityType: "message",
          entityId: assistantMessage.id,
          discordChannelId: message.channelId,
          discordMessageId: message.id,
          direction: "discord_to_tribe",
        });
      },
    });

    if (!process.env.ANTHROPIC_API_KEY) {
      await this.replyToDiscordMessage(message, reply);
    }
  }

  private async handleDiscordCommand(command: DiscordAssistantCommand, message: Message): Promise<void> {
    if (command.type === "help") {
      const detail = command.error ? `${command.error}\n` : "";
      await this.replyToDiscordMessage(
        message,
        `${detail}Commands: ${this.commandPrefix} actions, ${this.commandPrefix} approve <id>, ${this.commandPrefix} reject <id>`,
      );
      return;
    }

    if (command.type === "list_actions") {
      const actions = await this.actionRepo.findPending();
      await this.replyToDiscordMessage(message, formatPendingActionsForDiscord(actions));
      return;
    }

    const result = command.type === "approve"
      ? await this.approveAction(command.actionId)
      : await this.rejectAction(command.actionId);
    await this.replyToDiscordMessage(message, result);
  }

  private async handleDiscordInteraction(interaction: Interaction): Promise<void> {
    if (!interaction.isButton()) return;
    const parsed = parseActionCustomId(interaction.customId);
    if (!parsed) return;

    if (interaction.channelId !== this.threadId) {
      await interaction.reply({ content: "This control belongs to a different Tribe assistant thread.", ephemeral: true });
      return;
    }

    const result = parsed.operation === "approve"
      ? await this.approveAction(parsed.actionId)
      : await this.rejectAction(parsed.actionId);
    await interaction.reply({ content: result, ephemeral: true });
  }

  private async approveAction(actionId: number): Promise<string> {
    const result = await this.agent.executeApprovedAction(actionId);
    return result.success
      ? `Approved and executed Tribe action #${actionId}.`
      : `Could not approve Tribe action #${actionId}: ${result.error ?? "unknown error"}`;
  }

  private async rejectAction(actionId: number): Promise<string> {
    const action = await this.actionRepo.findById(actionId);
    if (!action) return `Action #${actionId} was not found.`;
    if (action.status !== "proposed") return `Action #${actionId} is ${action.status}, not proposed.`;

    await this.actionRepo.updateStatus(actionId, "rejected");
    const updated = await this.actionRepo.findById(actionId);
    if (updated) emit({ type: "assistant.action.updated", action: updated });
    return `Rejected Tribe action #${actionId}.`;
  }

  private buildDiscordMetadata(message: Message): AssistantMessageMetadata {
    const author = message.author;
    const globalName = (author as unknown as { globalName?: string | null }).globalName;
    return {
      origin: "discord",
      discord: {
        authorId: author.id,
        authorUsername: author.username,
        authorDisplayName: message.member?.displayName ?? globalName ?? author.username,
        channelId: message.channelId,
        messageId: message.id,
      },
    };
  }

  private async replyToDiscordMessage(message: Message, content: string): Promise<void> {
    const chunks = chunkDiscordText(content);
    const [first, ...rest] = chunks;
    if (first) {
      await message.reply({ content: first, allowedMentions: DISCORD_ALLOWED_MENTIONS });
    }
    const channel = message.channel as unknown as { send?: (options: MessageCreateOptions) => Promise<unknown> };
    if (typeof channel.send !== "function") return;
    for (const chunk of rest) {
      await channel.send({ content: chunk, allowedMentions: DISCORD_ALLOWED_MENTIONS });
    }
  }

  private buildActionComponents(actionId: number, disabled: boolean): ActionRowBuilder<ButtonBuilder>[] {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${ACTION_CUSTOM_ID_PREFIX}:approve:${actionId}`)
          .setLabel("Approve")
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`${ACTION_CUSTOM_ID_PREFIX}:reject:${actionId}`)
          .setLabel("Reject")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
      ),
    ];
  }

  private async createSyncSafe(data: Parameters<DiscordAssistantSyncRepository["create"]>[0]): Promise<void> {
    try {
      await this.syncRepo.create(data);
    } catch (err: any) {
      log(`sync row already exists or could not be saved: ${err?.message ?? err}`);
    }
  }
}

function parseActionCustomId(customId: string): { operation: ActionOperation; actionId: number } | null {
  const [prefixA, prefixB, operation, idRaw] = customId.split(":");
  if (`${prefixA}:${prefixB}` !== ACTION_CUSTOM_ID_PREFIX) return null;
  if (operation !== "approve" && operation !== "reject") return null;
  const actionId = Number(idRaw);
  if (!Number.isInteger(actionId) || actionId <= 0) return null;
  return { operation, actionId };
}

function asAssistantMessage(value: unknown): AssistantMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Partial<AssistantMessage>;
  if (typeof message.id !== "number" || typeof message.role !== "string" || typeof message.content !== "string") {
    return null;
  }
  return message as AssistantMessage;
}

function asAssistantAction(value: unknown): AssistantAction | null {
  if (!value || typeof value !== "object") return null;
  const action = value as Partial<AssistantAction>;
  if (typeof action.id !== "number" || typeof action.type !== "string" || typeof action.status !== "string") {
    return null;
  }
  return action as AssistantAction;
}

function readBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

async function getStoredDiscordSettings(): Promise<DiscordSettings> {
  const state = await new AppStateRepository().get();
  return normalizeDiscordSettings({
    token: normalizeNullableSetting(state.discordBotToken),
    threadId: normalizeNullableSetting(state.discordAssistantThreadId),
  });
}

function normalizeDiscordSettings(settings: DiscordSettings): DiscordSettings {
  return {
    token: normalizeNullableSetting(settings.token),
    threadId: normalizeNullableSetting(settings.threadId),
  };
}

function getDiscordSettingsSource(
  storedSettings: DiscordSettings,
  envSettings: DiscordSettings,
  token: string | null,
  threadId: string | null,
): DiscordSettingsSource {
  if (!token || !threadId) return "none";
  const hasStoredToken = storedSettings.token === token;
  const hasStoredThreadId = storedSettings.threadId === threadId;
  if (hasStoredToken && hasStoredThreadId) return "settings";
  if (!hasStoredToken && !hasStoredThreadId && envSettings.token === token && envSettings.threadId === threadId) {
    return "env";
  }
  return "mixed";
}
