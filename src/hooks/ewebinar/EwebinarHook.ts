import { existsSync, readFileSync } from "fs";
import { Ticket } from "../../entity/Ticket";
import { TicketPhase } from "../../enum/TicketPhase";
import { getTicketDir } from "../../lib/paths";
import { MondayHelper } from "../../monday/MondayHelper";
import type { MondayItemDetail } from "../../monday/types";
import type { ProjectHook } from "../ProjectHook";

function getConfiguredPersonId(): string | null {
  const fromDefault = process.env.EWEBINAR_DEFAULT_PERSON_ID?.trim();
  if (fromDefault) return fromDefault;

  const firstDevPerson = process.env.EWEBINAR_DEV_PEOPLE?.split(",")
    .map((value) => value.trim())
    .find(Boolean);
  return firstDevPerson ?? null;
}

function parseBoardId(ticket: Ticket, item?: MondayItemDetail): number | null {
  if (ticket.mondayBoardId != null) return ticket.mondayBoardId;
  const raw = item?.board?.id;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

export class EwebinarHook implements ProjectHook {
  readonly name = "ewebinar";

  shouldHandle(ticket: Ticket): boolean {
    return !!ticket.mondayItemId;
  }

  async onTicketImported(ticket: Ticket, item: MondayItemDetail): Promise<void> {
    if (!ticket.mondayItemId) return;

    const monday = MondayHelper.fromEnv();
    const boardId = parseBoardId(ticket, item);
    const personId = getConfiguredPersonId();

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
      console.warn("[hooks:ewebinar] missing EWEBINAR_DEFAULT_PERSON_ID/EWEBINAR_DEV_PEOPLE; people sync skipped");
    }

    await monday.updateItemStatus({
      itemIdOrLink: ticket.mondayItemId,
      boardId,
      statusLabel: "Coding",
    });
  }

  async onPhaseCompleted(ticket: Ticket, phaseName: TicketPhase): Promise<void> {
    if (!ticket.mondayItemId) return;

    if (phaseName === TicketPhase.IMPLEMENTATION) {
      await this.syncImplementationChecklist(ticket);
      return;
    }

    if (phaseName === TicketPhase.SHIP) {
      await this.moveToPrReview(ticket);
    }
  }

  private async syncImplementationChecklist(ticket: Ticket): Promise<void> {
    if (!ticket.uid) return;
    const personId = getConfiguredPersonId();
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

    const monday = MondayHelper.fromEnv();
    await monday.upsertImplementationChecklist({
      itemIdOrLink: ticket.mondayItemId!,
      person: personId,
      content,
    });
  }

  private async moveToPrReview(ticket: Ticket): Promise<void> {
    const boardId = parseBoardId(ticket);
    if (boardId == null) {
      console.warn(`[hooks:ewebinar] PR Review sync skipped for ticket ${ticket.id}: missing mondayBoardId`);
      return;
    }

    const monday = MondayHelper.fromEnv();
    await monday.updateItemStatus({
      itemIdOrLink: ticket.mondayItemId!,
      boardId,
      statusLabel: "PR Review",
    });
  }
}
