import { Router, type Request, type Response } from "express";
import { TicketRepository } from "../repository/TicketRepository";
import { FeedbackService } from "../service/FeedbackService";
import { runRestTool, sendRestToolResult } from "../tools/restAdapter";

const router = Router();

function parseId(value: unknown): number | null {
  const id = parseInt(Array.isArray(value) ? value[0] ?? "" : String(value ?? ""), 10);
  return Number.isNaN(id) ? null : id;
}

// GET /api/tickets/board?projectId=1&donePage=1
router.get("/board", async (req: Request, res: Response) => {
  try {
    const repo = new TicketRepository();
    const { projectId: projectIdRaw, donePage: donePageRaw } = req.query;
    const projectId = projectIdRaw ? parseInt(projectIdRaw as string, 10) : undefined;
    const donePage = donePageRaw ? parseInt(donePageRaw as string, 10) : 1;

    if (projectIdRaw && Number.isNaN(projectId as number)) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }
    if (Number.isNaN(donePage) || donePage < 1) {
      res.status(400).json({ error: "donePage must be a positive integer" });
      return;
    }

    res.json(await repo.findBoardTickets({
      ...(projectId != null ? { projectId } : {}),
      donePage,
    }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets?phase=CREATED&projectId=1
router.get("/", async (req: Request, res: Response) => {
  const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
  sendRestToolResult(res, await runRestTool("list_tickets", {
    ...(req.query.phase ? { phase: req.query.phase } : {}),
    ...(projectId != null && !Number.isNaN(projectId) ? { projectId } : {}),
  }));
});

// GET /api/tickets/:id
router.get("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("get_ticket", { id }));
});

// POST /api/tickets
router.post("/", async (req: Request, res: Response) => {
  sendRestToolResult(res, await runRestTool("create_ticket", req.body), { successStatus: 201 });
});

// PATCH /api/tickets/:id
router.patch("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("update_ticket", {
    ...req.body,
    id,
    enforceContentEditWindow: true,
    emitAfterUpdate: true,
  }));
});

// DELETE /api/tickets/:id
router.delete("/:id", async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("delete_ticket", { id }));
});

// GET /api/tickets/:ticketId/phases
router.get("/:ticketId/phases", async (req: Request, res: Response) => {
  const ticketId = parseId(req.params.ticketId);
  if (ticketId == null) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("list_phases", { ticketId }));
});

// POST /api/tickets/:ticketId/trigger-phase
router.post("/:ticketId/trigger-phase", async (req: Request, res: Response) => {
  const ticketId = parseId(req.params.ticketId);
  if (ticketId == null) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("trigger_phase", { ticketId, phaseName: req.body.phaseName }));
});

// POST /api/tickets/:id/feedback
router.post("/:id/feedback", async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id == null) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const { comment } = req.body;
    if (!comment || typeof comment !== "string" || !comment.trim()) {
      res.status(400).json({ error: "comment is required" });
      return;
    }

    const ticket = await new FeedbackService().create(id, comment);
    res.status(201).json(ticket);
  } catch (err: any) {
    const msg = err.message ?? "";
    let status = 500;
    if (msg.includes("not found")) status = 404;
    else if (
      msg.includes("draft") ||
      msg.includes("no shipped PR") ||
      msg.includes("already has an active phase") ||
      msg.includes("already has pending feedback") ||
      msg.includes("currently unavailable") ||
      msg.includes("No CLI")
    ) {
      status = 409;
    }
    res.status(status).json({ error: msg });
  }
});

// POST /api/tickets/:ticketId/respond-phase
router.post("/:ticketId/respond-phase", async (req: Request, res: Response) => {
  const ticketId = parseId(req.params.ticketId);
  if (ticketId == null) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }
  sendRestToolResult(res, await runRestTool("respond_phase", { ticketId, message: req.body.message }));
});

export default router;
