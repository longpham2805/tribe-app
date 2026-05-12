import { Router, type Request, type Response } from "express";
import { ProjectRepository } from "../repository/ProjectRepository";
import { MondayHelper } from "../monday/MondayHelper";
import { buildItemPreview, parseBoardId } from "../monday/preview";
import { isConfirmationResult } from "../tools/commands";
import { runRestTool, sendRestToolResult } from "../tools/restAdapter";

const router = Router();

function parseCsvNumbers(value: unknown): number[] | undefined {
  if (!value) return undefined;
  return String(value)
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

function parseCsvStrings(value: unknown): string[] | undefined {
  if (!value) return undefined;
  const values = String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

// GET /api/monday/not-started?boardIds=1,2&people=alice,bob&projectId=1
router.get("/not-started", async (req: Request, res: Response) => {
  const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
  const result = await runRestTool("monday_not_started_tickets", {
    ...(projectId != null && !Number.isNaN(projectId) ? { projectId } : {}),
    ...(parseCsvNumbers(req.query.boardIds) ? { boardIds: parseCsvNumbers(req.query.boardIds) } : {}),
    ...(parseCsvStrings(req.query.people) ? { people: parseCsvStrings(req.query.people) } : {}),
  });
  if (!result.ok && !isConfirmationResult(result)) {
    res.status(result.statusCode === 500 ? 502 : result.statusCode).json({ error: `Monday API error: ${result.error}` });
    return;
  }
  sendRestToolResult(res, result);
});

async function handleItemPreview(req: Request, res: Response) {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
    const project = projectId != null && !Number.isNaN(projectId)
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

router.get("/items/:id/preview", handleItemPreview);
router.get("/items/:id", handleItemPreview);
router.get("/item/:id", handleItemPreview);

// POST /api/monday/import
router.post("/import", async (req: Request, res: Response) => {
  const result = await runRestTool("monday_import_ticket", req.body);
  if (result.ok) {
    const action = (result.data as { action?: string }).action;
    res.status(action === "created" ? 201 : 200).json(result.data);
    return;
  }
  if (isConfirmationResult(result)) {
    sendRestToolResult(res, result);
    return;
  }
  res.status(result.statusCode === 500 ? 502 : result.statusCode).json({ error: `Import error: ${result.error}` });
});

export default router;
