import { Ticket } from "../entity/Ticket";
import { TicketPhase } from "../enum/TicketPhase";
import type { MondayItemDetail } from "../monday/types";
import type { ProjectHook } from "./ProjectHook";
import { EwebinarHook } from "./ewebinar/EwebinarHook";

const HOOKS: ProjectHook[] = [new EwebinarHook()];

function runSafely(hook: ProjectHook, task: () => Promise<void>, action: string): Promise<void> {
  return task().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[hooks:${hook.name}] ${action} failed: ${message}`);
  });
}

function hooksFor(ticket: Ticket): ProjectHook[] {
  return HOOKS.filter((hook) => {
    try {
      return hook.shouldHandle(ticket);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[hooks:${hook.name}] shouldHandle failed: ${message}`);
      return false;
    }
  });
}

export async function runTicketImportedHooks(ticket: Ticket, item: MondayItemDetail): Promise<void> {
  await Promise.all(
    hooksFor(ticket).map((hook) => {
      if (!hook.onTicketImported) return Promise.resolve();
      return runSafely(hook, () => hook.onTicketImported!(ticket, item), "onTicketImported");
    }),
  );
}

export async function runPhaseEnteredHooks(ticket: Ticket, phaseName: TicketPhase): Promise<void> {
  await Promise.all(
    hooksFor(ticket).map((hook) => {
      if (!hook.onPhaseEntered) return Promise.resolve();
      return runSafely(hook, () => hook.onPhaseEntered!(ticket, phaseName), "onPhaseEntered");
    }),
  );
}

export async function runPhaseCompletedHooks(ticket: Ticket, phaseName: TicketPhase): Promise<void> {
  await Promise.all(
    hooksFor(ticket).map((hook) => {
      if (!hook.onPhaseCompleted) return Promise.resolve();
      return runSafely(hook, () => hook.onPhaseCompleted!(ticket, phaseName), "onPhaseCompleted");
    }),
  );
}
