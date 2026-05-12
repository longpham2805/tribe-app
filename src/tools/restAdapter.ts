import type { Response } from "express";
import { executeToolCommand, isConfirmationResult } from "./commands";
import type { ToolCommandResult } from "./types";

export async function runRestTool(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolCommandResult> {
  return executeToolCommand(name, input, { source: "rest", confirmed: true });
}

export function sendRestToolResult(
  res: Response,
  result: ToolCommandResult,
  opts: {
    successStatus?: number;
    mapData?: (data: unknown) => unknown;
  } = {},
): void {
  if (result.ok) {
    res.status(opts.successStatus ?? result.statusCode ?? 200).json(opts.mapData ? opts.mapData(result.data) : result.data);
    return;
  }

  if (isConfirmationResult(result)) {
    res.status(409).json({
      error: result.pending.confirmation.reason,
      confirmationRequired: true,
      summary: result.pending.confirmation.summary,
    });
    return;
  }

  res.status(result.statusCode).json({ error: result.error });
}
