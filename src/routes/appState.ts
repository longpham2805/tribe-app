import { Router, type Request, type Response } from "express";
import { AppStateRepository } from "../repository/AppStateRepository";
import { CliType } from "../enum/CliType";
import { emit } from "../lib/events";

const router = Router();
const CLI_TYPE_VALUES = Object.values(CliType) as string[];
const DISCORD_BOT_TOKEN_MAX_LENGTH = 255;
const DISCORD_THREAD_ID_MAX_LENGTH = 64;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function parseNullableString(value: unknown, field: string, maxLength: number): { value?: string | null; error?: string } {
  if (value === undefined) return {};
  if (value !== null && typeof value !== "string") {
    return { error: `${field} must be a string or null` };
  }

  const normalized = typeof value === "string" ? value.trim() : null;
  if (!normalized) return { value: null };
  if (normalized.length > maxLength) {
    return { error: `${field} must be ${maxLength} characters or fewer` };
  }
  return { value: normalized };
}

function toAppStateResponse(state: Awaited<ReturnType<AppStateRepository["get"]>>) {
  return {
    ...state,
    discordBotToken: null,
    discordBotTokenConfigured: !!state.discordBotToken,
  };
}

function parseAvailableCliTypes(value: unknown): { cliTypes?: CliType[]; error?: string } {
  if (value === undefined) return {};
  if (!Array.isArray(value)) {
    return { error: `availableCliTypes must be an array of: ${CLI_TYPE_VALUES.join(", ")}` };
  }

  const invalid = value.find((cliType) => typeof cliType !== "string" || !CLI_TYPE_VALUES.includes(cliType));
  if (invalid !== undefined) {
    return { error: `availableCliTypes must only contain: ${CLI_TYPE_VALUES.join(", ")}` };
  }

  return { cliTypes: [...new Set(value as CliType[])] };
}

router.get("/", async (_req: Request, res: Response) => {
  try {
    const state = await new AppStateRepository().get();
    res.json(toAppStateResponse(state));
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.patch("/", async (req: Request, res: Response) => {
  try {
    const payload = req.body as {
      autoTriggerEnabled?: unknown;
      availableCliTypes?: unknown;
      discordBotToken?: unknown;
      discordAssistantThreadId?: unknown;
    };

    if (
      payload.autoTriggerEnabled !== undefined &&
      typeof payload.autoTriggerEnabled !== "boolean"
    ) {
      res.status(400).json({ error: "autoTriggerEnabled must be a boolean" });
      return;
    }

    const parsedCliTypes = parseAvailableCliTypes(payload.availableCliTypes);
    if (parsedCliTypes.error) {
      res.status(400).json({ error: parsedCliTypes.error });
      return;
    }

    const parsedDiscordBotToken = parseNullableString(
      payload.discordBotToken,
      "discordBotToken",
      DISCORD_BOT_TOKEN_MAX_LENGTH,
    );
    if (parsedDiscordBotToken.error) {
      res.status(400).json({ error: parsedDiscordBotToken.error });
      return;
    }

    const parsedDiscordAssistantThreadId = parseNullableString(
      payload.discordAssistantThreadId,
      "discordAssistantThreadId",
      DISCORD_THREAD_ID_MAX_LENGTH,
    );
    if (parsedDiscordAssistantThreadId.error) {
      res.status(400).json({ error: parsedDiscordAssistantThreadId.error });
      return;
    }

    const state = await new AppStateRepository().update({
      autoTriggerEnabled: payload.autoTriggerEnabled,
      availableCliTypes: parsedCliTypes.cliTypes,
      discordBotToken: parsedDiscordBotToken.value,
      discordAssistantThreadId: parsedDiscordAssistantThreadId.value,
    });
    const responseState = toAppStateResponse(state);
    emit({ type: "app-state.updated", appState: responseState });
    res.json(responseState);
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

export default router;
