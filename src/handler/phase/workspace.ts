import { Ticket } from "../../entity/Ticket";
import { SlotRepository } from "../../repository/SlotRepository";
import { ProjectRepository } from "../../repository/ProjectRepository";
import { getTicketDir } from "../../lib/paths";
import type { ProjectAgentContext } from "../../agent";
import { phaseLog } from "./phaseLogging";

export async function resolvePhaseWorkspace(ticket: Ticket): Promise<{ slotRoot: string; tmpDir: string }> {
  if (!ticket.uid) {
    throw new Error(`Ticket #${ticket.id} has no uid — workspace not initialized`);
  }
  if (ticket.slotId == null) {
    throw new Error(`Ticket #${ticket.id} has no slot assigned — assign a slot before triggering phases`);
  }

  const slotRepo = new SlotRepository();
  const slot = await slotRepo.findById(ticket.slotId);
  if (!slot) throw new Error(`Slot ${ticket.slotId} not found`);

  const tmpDir = getTicketDir(ticket.uid);
  phaseLog(`workspace → slotRoot=${slot.rootPath} tmpDir=${tmpDir}`);
  return { slotRoot: slot.rootPath, tmpDir };
}

export async function loadProjectAgentContext(ticket: Ticket): Promise<ProjectAgentContext | undefined> {
  if (ticket.projectId == null) return undefined;

  const project = await new ProjectRepository().findById(ticket.projectId);
  if (!project) {
    phaseLog(`WARN: project ${ticket.projectId} not found for ticket #${ticket.id}`);
    return undefined;
  }

  return {
    introduction: project.introduction,
    rules: project.rules,
    techStack: project.techStack,
  };
}
