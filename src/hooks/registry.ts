import { Ticket } from "../entity/Ticket";
import { TicketPhase } from "../enum/TicketPhase";
import type { MondayItemDetail } from "../monday/types";
import type { ProjectHook, ProjectSettings } from "./ProjectHook";
import { EwebinarHook } from "./ewebinar/EwebinarHook";
import { ProjectRepository } from "../repository/ProjectRepository";

const HOOKS: ProjectHook[] = [new EwebinarHook()];

function settingsFromEnv(): ProjectSettings {
  const boardIdsRaw = process.env.MONDAY_DEFAULT_BOARD_IDS ?? "";
  const mondayBoardIds = boardIdsRaw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);

  const devPeopleRaw = process.env.EWEBINAR_DEV_PEOPLE ?? "";
  const mondayDevPeople = devPeopleRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    mondayBoardIds,
    mondayDefaultPersonId: process.env.EWEBINAR_DEFAULT_PERSON_ID?.trim() ?? null,
    mondayDevPeople,
  };
}

async function loadProjectSettings(ticket: Ticket): Promise<ProjectSettings> {
  if (ticket.projectId == null) return settingsFromEnv();
  try {
    const project = await new ProjectRepository().findById(ticket.projectId);
    if (!project) return settingsFromEnv();
    return {
      mondayBoardIds: project.mondayBoardIds ?? [],
      mondayDefaultPersonId: project.mondayDefaultPersonId ?? null,
      mondayDevPeople: project.mondayDevPeople ?? [],
    };
  } catch {
    return settingsFromEnv();
  }
}

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
  const settings = await loadProjectSettings(ticket);
  await Promise.all(
    hooksFor(ticket).map((hook) => {
      if (!hook.onTicketImported) return Promise.resolve();
      return runSafely(hook, () => hook.onTicketImported!(ticket, item, settings), "onTicketImported");
    }),
  );
}

export async function runPhaseEnteredHooks(ticket: Ticket, phaseName: TicketPhase): Promise<void> {
  const settings = await loadProjectSettings(ticket);
  await Promise.all(
    hooksFor(ticket).map((hook) => {
      if (!hook.onPhaseEntered) return Promise.resolve();
      return runSafely(hook, () => hook.onPhaseEntered!(ticket, phaseName, settings), "onPhaseEntered");
    }),
  );
}

export async function runPhaseCompletedHooks(ticket: Ticket, phaseName: TicketPhase): Promise<void> {
  const settings = await loadProjectSettings(ticket);
  await Promise.all(
    hooksFor(ticket).map((hook) => {
      if (!hook.onPhaseCompleted) return Promise.resolve();
      return runSafely(hook, () => hook.onPhaseCompleted!(ticket, phaseName, settings), "onPhaseCompleted");
    }),
  );
}
