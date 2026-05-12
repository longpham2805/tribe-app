import { Router, type Request, type Response } from "express";
import { runRestTool, sendRestToolResult } from "../tools/restAdapter";

const router = Router();

function parseId(value: unknown): number | null {
  const id = parseInt(Array.isArray(value) ? value[0] ?? "" : String(value ?? ""), 10);
  return Number.isNaN(id) ? null : id;
}

// GET /api/tickets/:ticketId/phases
router.get("/ticket/:ticketId", async (req: Request, res: Response) => {
  const ticketId = parseId(req.params.ticketId);
  if (ticketId == null) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("list_phases", { ticketId }));
});

// GET /api/phases/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid phase ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("get_phase", { id }));
});

// POST /api/phases
router.post("/", async (req: Request, res: Response) => {
  sendRestToolResult(res, await runRestTool("create_phase", req.body), { successStatus: 201 });
});

// PATCH /api/phases/:id
router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid phase ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("update_phase", { ...req.body, id }));
});

// DELETE /api/phases/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid phase ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("delete_phase", { id }));
});

export default router;
