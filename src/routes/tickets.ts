import { Router, type Request, type Response } from "express";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { TicketPhase } from "../enum/TicketPhase";
import { CliType } from "../enum/CliType";
import { TicketStatus } from "../enum/TicketStatus";
import { PhaseHandler } from "../handler/PhaseHandler";
import { pickCliForNewTicket } from "../cli";
import { AppStateRepository } from "../repository/AppStateRepository";
import { emit } from "../lib/events";

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

function parseTicketStatus(value: unknown, fallback = TicketStatus.READY): TicketStatus | null {
  if (value === undefined) return fallback;
  return typeof value === "string" && TICKET_STATUS_VALUES.includes(value)
    ? (value as TicketStatus)
    : null;
}

function hasProcessingStarted(ticket: { uid: string | null; slotId: number | null; waitingForSlot: boolean; phases?: Array<{ startedAt: Date | null; completedAt: Date | null }> }): boolean {
  return (
    ticket.uid != null ||
    ticket.slotId != null ||
    ticket.waitingForSlot ||
    Boolean(ticket.phases?.some((phase) => phase.startedAt || phase.completedAt))
  );
}

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

    const ticketRepo = new TicketRepository();
    let cliType = cliTypeRaw ? (cliTypeRaw as CliType) : CliType.CLAUDE;

    if (status === TicketStatus.READY) {
      const appState = await new AppStateRepository().get();
      if (appState.availableCliTypes.length === 0) {
        res.status(409).json({ error: "No CLI is currently available" });
        return;
      }
      if (cliTypeRaw !== undefined && !appState.availableCliTypes.includes(cliTypeRaw as CliType)) {
        res.status(409).json({ error: `${cliTypeRaw} is currently unavailable` });
        return;
      }
      cliType = cliTypeRaw
        ? (cliTypeRaw as CliType)
        : await pickCliForNewTicket(ticketRepo, appState.availableCliTypes);
    }

    const ticket = await ticketRepo.create({
      title,
      description,
      projectId: typeof projectId === "number" ? projectId : null,
      cliType,
      status,
    });

    if (status === TicketStatus.READY) {
      // Run CREATED phase handler now that the insert transaction is committed,
      // so the ticket row is no longer locked and slot assignment can succeed.
      const handler = new PhaseHandler();
      await handler.initCreated(ticket);
    }

    const full = await ticketRepo.findById(ticket.id);
    res.status(201).json(full);
  } catch (err: any) {
    const msg = err.message ?? "";
    const status = msg.includes("No CLI") || msg.includes("currently unavailable") || msg.includes("is draft") ? 409 : 500;
    res.status(status).json({ error: msg });
  }
});

// PATCH /api/tickets/:id  { title?, description?, currentPhase?, status? }
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const ticketRepo = new TicketRepository();
    const phaseRepo = new PhaseRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const existing = await ticketRepo.findById(id);
    if (!existing) {
      res.status(404).json({ error: `Ticket ${id} not found` });
      return;
    }

    const { title, description, currentPhase, status: statusRaw } = req.body;
    const hasTitlePatch = title !== undefined;
    const hasDescriptionPatch = description !== undefined;
    const hasContentPatch = hasTitlePatch || hasDescriptionPatch;

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

    if (existing.status === TicketStatus.DRAFT && currentPhase && currentPhase !== existing.currentPhase) {
      res.status(409).json({ error: `Ticket ${id} is draft and cannot be processed` });
      return;
    }

    if (existing.status === TicketStatus.READY && nextStatus === TicketStatus.DRAFT && hasProcessingStarted(existing)) {
      res.status(409).json({ error: `Ticket ${id} has already started processing and cannot be moved to draft` });
      return;
    }

    if (existing.status === TicketStatus.DRAFT && nextStatus === TicketStatus.READY) {
      const appState = await new AppStateRepository().get();
      if (appState.availableCliTypes.length === 0) {
        res.status(409).json({ error: "No CLI is currently available" });
        return;
      }
      if (!appState.availableCliTypes.includes(existing.cliType)) {
        res.status(409).json({ error: `${existing.cliType} is currently unavailable` });
        return;
      }
    }

    if (hasContentPatch && !existing.waitingForSlot) {
      res.status(409).json({ error: "Ticket content can only be edited while waiting for a slot" });
      return;
    }

    // If phase is changing, complete the active phase and activate the pending one
    if (currentPhase && currentPhase !== existing.currentPhase) {
      const activePhase = await phaseRepo.findActiveByTicketId(id);
      if (activePhase) {
        await phaseRepo.update(activePhase.id, { completedAt: new Date() });
      }
      const pending = await phaseRepo.findPendingByTicketIdAndName(id, currentPhase as TicketPhase);
      if (pending) {
        await phaseRepo.activate(pending.id);
      }
    }

    await ticketRepo.update(id, {
      title: hasTitlePatch ? title.trim() : undefined,
      description: hasDescriptionPatch ? description.trim() : undefined,
      currentPhase: currentPhase as TicketPhase | undefined,
      status: nextStatus === existing.status || (existing.status === TicketStatus.DRAFT && nextStatus === TicketStatus.READY)
        ? undefined
        : nextStatus,
    });

    if (existing.status === TicketStatus.DRAFT && nextStatus === TicketStatus.READY) {
      const handler = new PhaseHandler();
      const full = await handler.publish(id);
      res.json(full);
      return;
    }

    const full = await ticketRepo.findById(id);
    if (full) emit({ type: "ticket.updated", ticket: full });
    res.json(full);
  } catch (err: any) {
    const msg = err.message ?? "";
    const status = msg.includes("No CLI") || msg.includes("currently unavailable") || msg.includes("is draft") ? 409 : 500;
    res.status(status).json({ error: msg });
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
