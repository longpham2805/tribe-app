import { Router, type Request, type Response } from "express";
import { AppStateRepository } from "../repository/AppStateRepository";
import { CliType } from "../enum/CliType";
import { emit } from "../lib/events";

const router = Router();
const CLI_TYPE_VALUES = Object.values(CliType) as string[];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
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
    res.json(state);
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.patch("/", async (req: Request, res: Response) => {
  try {
    const payload = req.body as {
      autoTriggerEnabled?: unknown;
      availableCliTypes?: unknown;
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

    const state = await new AppStateRepository().update({
      autoTriggerEnabled: payload.autoTriggerEnabled,
      availableCliTypes: parsedCliTypes.cliTypes,
    });
    emit({ type: "app-state.updated", appState: state });
    res.json(state);
  } catch (error: unknown) {
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

export default router;
