import { Router, type Request, type Response } from "express";
import { TicketRepository } from "../repository/TicketRepository";
import { ProjectRepository } from "../repository/ProjectRepository";
import { MondayHelper } from "../monday/MondayHelper";
import { formatItemMarkdown } from "../monday/formatItemMarkdown";
import { buildItemPreview, parseBoardId } from "../monday/preview";
import { runTicketImportedHooks } from "../hooks/registry";
import { TicketStatus } from "../enum/TicketStatus";
import { CliType } from "../enum/CliType";
import { TicketActivationService } from "../service/TicketActivationService";

const router = Router();
const TICKET_STATUS_VALUES = Object.values(TicketStatus) as string[];

function parseTicketStatus(value: unknown, fallback = TicketStatus.READY): TicketStatus | null {
  if (value === undefined) return fallback;
  return typeof value === "string" && TICKET_STATUS_VALUES.includes(value)
    ? (value as TicketStatus)
    : null;
}

// GET /api/monday/not-started?boardIds=1,2&people=alice,bob&projectId=1
router.get("/not-started", async (req: Request, res: Response) => {
  try {
    const boardIdsOverride = req.query.boardIds
      ? String(req.query.boardIds)
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n))
      : undefined;

    const people = req.query.people
      ? String(req.query.people)
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;

    const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
    let monday: MondayHelper;

    if (projectId != null && !isNaN(projectId)) {
      const project = await new ProjectRepository().findById(projectId);
      monday = new MondayHelper({
        accessToken: process.env.MONDAY_ACCESS_TOKEN,
        apiUrl: process.env.MONDAY_API_URL,
        defaultBoardIds: boardIdsOverride ?? (project?.mondayBoardIds ?? undefined),
        ewebinarDevPeople: project?.mondayDevPeople ?? undefined,
      });
    } else {
      monday = MondayHelper.fromEnv();
      if (boardIdsOverride) {
        monday = new MondayHelper({
          accessToken: process.env.MONDAY_ACCESS_TOKEN,
          apiUrl: process.env.MONDAY_API_URL,
          defaultBoardIds: boardIdsOverride,
        });
      }
    }

    const { items } = await monday.getNotStartedItems({
      boardIds: boardIdsOverride,
      peopleOverride: people,
    });

    res.json({ count: items.length, items });
  } catch (err: any) {
    res.status(502).json({ error: `Monday API error: ${err.message}` });
  }
});

async function handleItemPreview(req: Request, res: Response) {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
    const project = projectId != null && !isNaN(projectId)
      ? await new ProjectRepository().findById(projectId)
      : null;
    const monday = project
      ? new MondayHelper({
          accessToken: process.env.MONDAY_ACCESS_TOKEN,
          apiUrl: process.env.MONDAY_API_URL,
          defaultBoardIds: project.mondayBoardIds ?? undefined,
          ewebinarDevPeople: project.mondayDevPeople ?? undefined,
        })
      : MondayHelper.fromEnv();
    const { item } = await monday.getItemDetails(String(req.params.id));

    if (project?.mondayBoardIds?.length) {
      const boardId = parseBoardId(item.board?.id);
      if (boardId == null || !project.mondayBoardIds.includes(boardId)) {
        res.status(404).json({ error: `Monday item ${item.id} does not belong to project ${project.name}.` });
        return;
      }
    }

    res.json(await buildItemPreview(item));
  } catch (err: any) {
    res.status(502).json({ error: `Monday API error: ${err.message}` });
  }
}

// GET /api/monday/items/:id/preview — preview for import step 2
router.get("/items/:id/preview", handleItemPreview);
router.get("/items/:id", handleItemPreview);
router.get("/item/:id", handleItemPreview);

// POST /api/monday/import  { mondayItemId: string, projectId?: number, status?: "DRAFT" | "READY" }
router.post("/import", async (req: Request, res: Response) => {
  try {
    const { mondayItemId, clues, projectId, status: statusRaw, cliType: cliTypeRaw, titleOverride } = req.body;
    if (!mondayItemId || typeof mondayItemId !== "string") {
      res.status(400).json({ error: "mondayItemId (string) is required — numeric ID or Monday URL" });
      return;
    }
    const status = parseTicketStatus(statusRaw);
    if (!status) {
      res.status(400).json({ error: `status must be one of: ${TICKET_STATUS_VALUES.join(", ")}` });
      return;
    }
    const description = clues && typeof clues === "string" && clues.trim() ? clues.trim() : undefined;
    const resolvedProjectId: number | null =
      typeof projectId === "number" ? projectId : null;
    const resolvedCliType: CliType | undefined =
      cliTypeRaw === CliType.CLAUDE || cliTypeRaw === CliType.CODEX ? cliTypeRaw : undefined;

    // 1. Fetch from Monday
    const monday = MondayHelper.fromEnv();
    const { item } = await monday.getItemDetails(mondayItemId);

    // 2. Convert to structured markdown
    const markdown = formatItemMarkdown(item);
    const mondayBoardId = parseBoardId(item.board?.id);

    // 3. Upsert into DB
    const ticketRepo = new TicketRepository();
    const existing = await ticketRepo.findByMondayItemId(item.id);

    let ticket;
    let action: "created" | "updated";

    const resolvedTitle =
      typeof titleOverride === "string" && titleOverride.trim() ? titleOverride.trim() : item.name;

    if (existing) {
      ticket = await ticketRepo.update(existing.id, {
        title: resolvedTitle,
        mondayItemId: item.id,
        mondayBoardId,
        mondayMarkdown: markdown,
        status,
        ...(description !== undefined ? { description } : {}),
      });
      action = "updated";
    } else {
      ticket = await ticketRepo.create({
        title: resolvedTitle,
        mondayItemId: item.id,
        mondayBoardId,
        mondayMarkdown: markdown,
        description,
        projectId: resolvedProjectId,
        status,
        ...(resolvedCliType ? { cliType: resolvedCliType } : {}),
      });

      ticket = await ticketRepo.findById(ticket.id);
      action = "created";
    }

    if (ticket && ticket.status === TicketStatus.READY) {
      await runTicketImportedHooks(ticket, item);
    }

    if (action === "created") {
      new TicketActivationService().activateCreatedIfReady(ticket, "monday-import");
    }

    res.status(action === "created" ? 201 : 200).json({
      action,
      ticket,
      mondayMarkdown: markdown,
    });
  } catch (err: any) {
    res.status(502).json({ error: `Import error: ${err.message}` });
  }
});

export default router;
