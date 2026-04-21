import { Router, type Request, type Response } from "express";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { TicketPhase } from "../enum/TicketPhase";

const PHASE_VALUES = Object.values(TicketPhase) as string[];
const router = Router();

// GET /api/tickets?phase=CREATED
router.get("/", async (req: Request, res: Response) => {
  try {
    const repo = new TicketRepository();
    const { phase } = req.query;

    if (phase && !PHASE_VALUES.includes(phase as string)) {
      res.status(400).json({ error: `Invalid phase. Must be one of: ${PHASE_VALUES.join(", ")}` });
      return;
    }

    const tickets = phase
      ? await repo.findByPhase(phase as TicketPhase)
      : await repo.findAll();

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

// POST /api/tickets  { title, description? }
router.post("/", async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const ticketRepo = new TicketRepository();

    const ticket = await ticketRepo.create({ title, description });
    const full = await ticketRepo.findById(ticket.id);
    res.status(201).json(full);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tickets/:id  { title?, description?, currentPhase? }
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

    const { title, description, currentPhase } = req.body;

    if (currentPhase && !PHASE_VALUES.includes(currentPhase)) {
      res.status(400).json({ error: `Invalid phase. Must be one of: ${PHASE_VALUES.join(", ")}` });
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
      title,
      description,
      currentPhase: currentPhase as TicketPhase | undefined,
    });

    const full = await ticketRepo.findById(id);
    res.json(full);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

    const deleted = await repo.delete(id);
    if (!deleted) {
      res.status(404).json({ error: `Ticket ${id} not found` });
      return;
    }

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

export default router;
