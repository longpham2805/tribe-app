import { CliType } from "../enum/CliType";
import { ClaudeAdapter } from "./ClaudeAdapter";
import { CodexAdapter } from "./CodexAdapter";
import type { CliAdapter } from "./CliAdapter";
import type { TicketRepository } from "../repository/TicketRepository";

const ADAPTERS: Record<CliType, CliAdapter> = {
  [CliType.CLAUDE]: new ClaudeAdapter(),
  [CliType.CODEX]: new CodexAdapter(),
};

export const getAdapter = (type: CliType): CliAdapter => ADAPTERS[type];

export async function pickCliForNewTicket(repo: TicketRepository): Promise<CliType> {
  const last = await repo.findLastCreated();
  return last?.cliType === CliType.CLAUDE ? CliType.CODEX : CliType.CLAUDE;
}
