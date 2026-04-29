import { Router, type Request, type Response } from "express";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { TicketPhase } from "../enum/TicketPhase";
import { CliType } from "../enum/CliType";
import { TicketStatus } from "../enum/TicketStatus";
import { PhaseHandler } from "../handler/PhaseHandler";
import { FeedbackService } from "../service/FeedbackService";
import { parseTicketStatus, TicketMutationError, TicketMutationService } from "../service/tickets/TicketMutationService";

const PHASE_VALUES = Object.values(TicketPhase) as string[];
const TICKET_STATUS_VALUES = Object.values(TicketStatus) as string[];
const router = Router();

// GET /api/tickets/board?projectId=1&donePage=1
router.get("/board", async (req: Request, res: Response) => {
  try {
    const repo = new TicketRepository();
    const { projectId: projectIdRaw, donePage: donePageRaw } = req.query;

    const projectId = projectIdRaw ? parseInt(projectIdRaw as string, 10) : undefined;
    const donePage = donePageRaw ? parseInt(donePageRaw as string, 10) : 1;

    if (projectIdRaw && isNaN(projectId as number)) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }

    if (isNaN(donePage) || donePage < 1) {
      res.status(400).json({ error: "donePage must be a positive integer" });
      return;
    }

    const boardTickets = await repo.findBoardTickets({
      ...(projectId != null ? { projectId } : {}),
      donePage,
    });

    res.json(boardTickets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets?phase=CREATED&projectId=1
router.get("/", async (req: Request, res: Response) => {
  try {
    const repo = new TicketRepository();
    const { phase, projectId: projectIdRaw } = req.query;

    if (phase && !PHASE_VALUES.includes(phase as string)) {
      res.status(400).json({ error: `Invalid phase. Must be one of: ${PHASE_VALUES.join(", ")}` });
      return;
    }

    const projectId = projectIdRaw ? parseInt(projectIdRaw as string, 10) : undefined;
    const opts = projectId != null && !isNaN(projectId) ? { projectId } : undefined;

    const tickets = phase
      ? await repo.findByPhase(phase as TicketPhase, opts)
      : await repo.findAll(opts);

    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new TicketRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const ticket = await repo.findById(id);
    if (!ticket) {
      res.status(404).json({ error: `Ticket ${id} not found` });
      return;
    }

    res.json(ticket);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const CLI_TYPE_VALUES = Object.values(CliType) as string[];

// POST /api/tickets  { title, description?, projectId?, cliType?, status? }
router.post("/", async (req: Request, res: Response) => {
  try {
    const { title, description, projectId, cliType: cliTypeRaw, status: statusRaw } = req.body;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }

    if (cliTypeRaw !== undefined && !CLI_TYPE_VALUES.includes(cliTypeRaw)) {
      res.status(400).json({ error: `cliType must be one of: ${CLI_TYPE_VALUES.join(", ")}` });
      return;
    }

    const status = parseTicketStatus(statusRaw);
    if (!status) {
      res.status(400).json({ error: `status must be one of: ${TICKET_STATUS_VALUES.join(", ")}` });
      return;
    }

    const full = await new TicketMutationService().create({
      title,
      description,
      projectId: typeof projectId === "number" ? projectId : null,
      cliType: cliTypeRaw ? (cliTypeRaw as CliType) : undefined,
      status,
      activationContext: "ticket-create",
    });
    res.status(201).json(full);
  } catch (err: any) {
    const status = err instanceof TicketMutationError ? err.statusCode : 500;
    res.status(status).json({ error: err.message ?? "" });
  }
});

// PATCH /api/tickets/:id  { title?, description?, currentPhase?, status? }
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const ticketRepo = new TicketRepository();
    const existing = await ticketRepo.findById(id);
    if (!existing) {
      res.status(404).json({ error: `Ticket ${id} not found` });
      return;
    }

    const { title, description, currentPhase, status: statusRaw } = req.body;
    const hasTitlePatch = title !== undefined;
    const hasDescriptionPatch = description !== undefined;

    if (hasTitlePatch && (typeof title !== "string" || title.trim().length === 0 || title.trim().length > 255)) {
      res.status(400).json({ error: "title must be a non-empty string of 255 characters or fewer" });
      return;
    }

    if (hasDescriptionPatch && typeof description !== "string") {
      res.status(400).json({ error: "description must be a string" });
      return;
    }

    if (currentPhase && !PHASE_VALUES.includes(currentPhase)) {
      res.status(400).json({ error: `Invalid phase. Must be one of: ${PHASE_VALUES.join(", ")}` });
      return;
    }

    const nextStatus = parseTicketStatus(statusRaw, existing.status);
    if (!nextStatus) {
      res.status(400).json({ error: `status must be one of: ${TICKET_STATUS_VALUES.join(", ")}` });
      return;
    }

    const full = await new TicketMutationService(ticketRepo).update({
      id,
      title: hasTitlePatch ? title.trim() : undefined,
      description: hasDescriptionPatch ? description.trim() : undefined,
      currentPhase: currentPhase as TicketPhase | undefined,
      status: nextStatus,
      enforceContentEditWindow: true,
      emitAfterUpdate: true,
    });

    res.json(full);
  } catch (err: any) {
    const status = err instanceof TicketMutationError ? err.statusCode : 500;
    res.status(status).json({ error: err.message ?? "" });
  }
});

// DELETE /api/tickets/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new TicketRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const ticket = await repo.findById(id);
    if (!ticket) {
      res.status(404).json({ error: `Ticket ${id} not found` });
      return;
    }

    if (ticket.slotId != null) {
      const { SlotRepository } = await import("../repository/SlotRepository");
      const { SlotService } = await import("../service/SlotService");
      const slotRepo = new SlotRepository();
      const slot = await slotRepo.findById(ticket.slotId);
      if (slot) {
        await new SlotService().releaseAndPromoteQueue(slot);
      }
    }

    await repo.delete(id);
    res.json({ message: `Ticket ${id} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:ticketId/phases  (convenience nested route)
router.get("/:ticketId/phases", async (req: Request, res: Response) => {
  try {
    const phaseRepo = new PhaseRepository();
    const ticketId = parseInt(req.params.ticketId as string, 10);
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const phases = await phaseRepo.findByTicketId(ticketId);
    res.json(phases);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets/:ticketId/trigger-phase  { phaseName }
router.post("/:ticketId/trigger-phase", async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.ticketId as string, 10);
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const { phaseName } = req.body;
    if (!phaseName || !PHASE_VALUES.includes(phaseName)) {
      res.status(400).json({ error: `phaseName is required and must be one of: ${PHASE_VALUES.join(", ")}` });
      return;
    }

    const handler = new PhaseHandler();
    const result = await handler.trigger(ticketId, phaseName as TicketPhase);
    res.json(result);
  } catch (err: any) {
    const msg = err.message ?? "";
    let status = 500;
    if (msg.includes("not found")) status = 404;
    else if (msg.includes("currently unavailable") || msg.includes("No CLI") || msg.includes("is draft")) status = 409;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/tickets/:id/feedback  { comment }
router.post("/:id/feedback", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
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

// POST /api/tickets/:ticketId/respond-phase  { message }
router.post("/:ticketId/respond-phase", async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.ticketId as string, 10);
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const { message } = req.body;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const handler = new PhaseHandler();
    const result = await handler.respond(ticketId, message);
    res.json(result);
  } catch (err: any) {
    const msg = err.message ?? "";
    let status = 500;
    if (msg.includes("not found")) status = 404;
    else if (msg.includes("currently unavailable") || msg.includes("No CLI")) status = 409;
    else if (
      msg.includes("has no active phase") ||
      msg.includes("not awaiting a response") ||
      msg.includes("has no CLI session ID")
    ) {
      status = 400;
    }
    res.status(status).json({ error: msg });
  }
});

export default router;
