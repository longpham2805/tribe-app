import { CliType } from "../enum/CliType";
import { ClaudeAdapter } from "./ClaudeAdapter";
import { CodexAdapter } from "./CodexAdapter";
import type { CliAdapter } from "./CliAdapter";
import type { TicketRepository } from "../repository/TicketRepository";
import { AppStateRepository, DEFAULT_AVAILABLE_CLI_TYPES } from "../repository/AppStateRepository";

const ADAPTERS: Record<CliType, CliAdapter> = {
  [CliType.CLAUDE]: new ClaudeAdapter(),
  [CliType.CODEX]: new CodexAdapter(),
};

export const getAdapter = (type: CliType): CliAdapter => ADAPTERS[type];

export async function pickCliForNewTicket(
  repo: TicketRepository,
  availableCliTypes?: CliType[],
): Promise<CliType> {
  const available = availableCliTypes ?? (await new AppStateRepository().get()).availableCliTypes;
  if (available.length === 0) {
    throw new Error("No CLI is currently available");
  }

  const last = await repo.findLastCreated();
  const orderedCliTypes = DEFAULT_AVAILABLE_CLI_TYPES;
  const startIndex = last ? orderedCliTypes.indexOf(last.cliType) + 1 : 0;

  for (let offset = 0; offset < orderedCliTypes.length; offset++) {
    const cliType = orderedCliTypes[(startIndex + offset) % orderedCliTypes.length];
    if (available.includes(cliType)) return cliType;
  }

  return available[0];
}
