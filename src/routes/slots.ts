import { Router, type Request, type Response } from "express";
import { runRestTool, sendRestToolResult } from "../tools/restAdapter";

const router = Router();

function parseId(value: unknown): number | null {
  const id = parseInt(Array.isArray(value) ? value[0] ?? "" : String(value ?? ""), 10);
  return Number.isNaN(id) ? null : id;
}

function slotFromWriteResult(data: unknown): unknown {
  return (data as { slot?: unknown }).slot ?? data;
}

// GET /api/slots?projectId=1
router.get("/", async (req: Request, res: Response) => {
  const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
  sendRestToolResult(res, await runRestTool("list_slots", {
    ...(projectId != null && !Number.isNaN(projectId) ? { projectId } : {}),
  }));
});

// GET /api/slots/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid slot ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("get_slot", { id }));
});

// POST /api/slots
router.post("/", async (req: Request, res: Response) => {
  sendRestToolResult(res, await runRestTool("create_slot", req.body), {
    successStatus: 201,
    mapData: slotFromWriteResult,
  });
});

// PATCH /api/slots/:id
router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid slot ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("update_slot", { ...req.body, slotId: id }), {
    mapData: slotFromWriteResult,
  });
});

// DELETE /api/slots/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid slot ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("delete_slot", { id }));
});

export default router;
