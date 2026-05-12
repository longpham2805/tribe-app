import { Router, type Request, type Response } from "express";
import { runRestTool, sendRestToolResult } from "../tools/restAdapter";

const router = Router();

function parseId(value: unknown): number | null {
  const id = parseInt(Array.isArray(value) ? value[0] ?? "" : String(value ?? ""), 10);
  return Number.isNaN(id) ? null : id;
}

function projectFromWriteResult(data: unknown): unknown {
  return (data as { project?: unknown }).project ?? data;
}

// GET /api/projects
router.get("/", async (_req: Request, res: Response) => {
  sendRestToolResult(res, await runRestTool("get_projects", {}));
});

// GET /api/projects/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("get_project", { id }));
});

// POST /api/projects
router.post("/", async (req: Request, res: Response) => {
  sendRestToolResult(res, await runRestTool("create_project", req.body), {
    successStatus: 201,
    mapData: projectFromWriteResult,
  });
});

// PATCH /api/projects/:id
router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("update_project", { ...req.body, projectId: id }), {
    mapData: projectFromWriteResult,
  });
});

// DELETE /api/projects/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("delete_project", { id }));
});

export default router;
