import { existsSync, readFileSync } from "fs";
import { Ticket } from "../../entity/Ticket";
import { TicketPhase } from "../../enum/TicketPhase";
import { getTicketDir } from "../../lib/paths";
import { MondayHelper } from "../../monday/MondayHelper";
import type { MondayItemDetail } from "../../monday/types";
import type { ProjectHook, ProjectSettings } from "../ProjectHook";

function parseBoardId(ticket: Ticket, item?: MondayItemDetail): number | null {
  if (ticket.mondayBoardId != null) return ticket.mondayBoardId;
  const raw = item?.board?.id;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

function mondayFromSettings(settings: ProjectSettings): MondayHelper {
  return new MondayHelper({
    accessToken: process.env.MONDAY_ACCESS_TOKEN,
    apiUrl: process.env.MONDAY_API_URL,
    defaultBoardIds: settings.mondayBoardIds,
    ewebinarDevPeople: settings.mondayDevPeople,
  });
}

export class EwebinarHook implements ProjectHook {
  readonly name = "ewebinar";

  shouldHandle(ticket: Ticket): boolean {
    return !!ticket.mondayItemId;
  }

  async onTicketImported(ticket: Ticket, item: MondayItemDetail, settings: ProjectSettings): Promise<void> {
    if (!ticket.mondayItemId) return;

    const monday = mondayFromSettings(settings);
    const boardId = parseBoardId(ticket, item);
    const personId = settings.mondayDefaultPersonId ?? settings.mondayDevPeople[0] ?? null;

    if (boardId == null) {
      console.warn(`[hooks:ewebinar] skipping import sync for ticket ${ticket.id}: missing mondayBoardId`);
      return;
    }

    if (personId) {
      await monday.updateItemPeople({
        itemIdOrLink: ticket.mondayItemId,
        boardId,
        personIds: [personId],
      });
    } else {
      console.warn("[hooks:ewebinar] missing mondayDefaultPersonId/mondayDevPeople; people sync skipped");
    }

    await monday.updateItemStatus({
      itemIdOrLink: ticket.mondayItemId,
      boardId,
      statusLabel: "Coding",
    });
  }

  async onPhaseCompleted(ticket: Ticket, phaseName: TicketPhase, settings: ProjectSettings): Promise<void> {
    if (!ticket.mondayItemId) return;

    if (phaseName === TicketPhase.IMPLEMENTATION) {
      await this.syncImplementationChecklist(ticket, settings);
      return;
    }

    if (phaseName === TicketPhase.SHIP) {
      await this.moveToPrReview(ticket, settings);
    }
  }

  private async syncImplementationChecklist(ticket: Ticket, settings: ProjectSettings): Promise<void> {
    if (!ticket.uid) return;
    const personId = settings.mondayDefaultPersonId ?? settings.mondayDevPeople[0] ?? null;
    if (!personId) {
      console.warn("[hooks:ewebinar] checklist sync skipped: missing default person configuration");
      return;
    }

    const checklistPath = `${getTicketDir(ticket.uid)}/implementation-testing-checklist.md`;
    if (!existsSync(checklistPath)) {
      console.warn(`[hooks:ewebinar] checklist sync skipped: ${checklistPath} not found`);
      return;
    }

    const content = readFileSync(checklistPath, "utf-8").trim();
    if (!content) return;

    const monday = mondayFromSettings(settings);
    await monday.upsertImplementationChecklist({
      itemIdOrLink: ticket.mondayItemId!,
      person: personId,
      content,
    });
  }

  private async moveToPrReview(ticket: Ticket, settings: ProjectSettings): Promise<void> {
    const boardId = parseBoardId(ticket);
    if (boardId == null) {
      console.warn(`[hooks:ewebinar] PR Review sync skipped for ticket ${ticket.id}: missing mondayBoardId`);
      return;
    }

    const monday = mondayFromSettings(settings);
    await monday.updateItemStatus({
      itemIdOrLink: ticket.mondayItemId!,
      boardId,
      statusLabel: "PR Review",
    });
  }
}
