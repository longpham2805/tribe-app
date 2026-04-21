import { Router, type Request, type Response } from "express";
import { PhaseRepository } from "../repository/PhaseRepository";
import { TicketPhase } from "../enum/TicketPhase";

const PHASE_VALUES = Object.values(TicketPhase) as string[];
const router = Router();

// GET /api/tickets/:ticketId/phases
router.get("/ticket/:ticketId", async (req: Request, res: Response) => {
  try {
    const repo = new PhaseRepository();
    const ticketId = parseInt(req.params.ticketId, 10);
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const phases = await repo.findByTicketId(ticketId);
    res.json(phases);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/phases/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new PhaseRepository();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid phase ID" });
      return;
    }

    const phase = await repo.findById(id);
    if (!phase) {
      res.status(404).json({ error: `Phase ${id} not found` });
      return;
    }

    res.json(phase);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/phases  { ticketId, phaseName, startedAt? }
router.post("/", async (req: Request, res: Response) => {
  try {
    const { ticketId, phaseName, startedAt } = req.body;

    if (!ticketId || typeof ticketId !== "number") {
      res.status(400).json({ error: "ticketId (number) is required" });
      return;
    }
    if (!phaseName || !PHASE_VALUES.includes(phaseName)) {
      res.status(400).json({ error: `phaseName is required and must be one of: ${PHASE_VALUES.join(", ")}` });
      return;
    }

    const repo = new PhaseRepository();
    const phase = await repo.create({
      ticketId,
      phaseName: phaseName as TicketPhase,
      startedAt: startedAt ? new Date(startedAt) : undefined,
    });

    res.status(201).json(phase);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/phases/:id  { phaseName?, startedAt?, completedAt? }
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new PhaseRepository();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid phase ID" });
      return;
    }

    const existing = await repo.findById(id);
    if (!existing) {
      res.status(404).json({ error: `Phase ${id} not found` });
      return;
    }

    const { phaseName, startedAt, completedAt } = req.body;

    if (phaseName && !PHASE_VALUES.includes(phaseName)) {
      res.status(400).json({ error: `Invalid phaseName. Must be one of: ${PHASE_VALUES.join(", ")}` });
      return;
    }

    const updated = await repo.update(id, {
      phaseName: phaseName as TicketPhase | undefined,
      startedAt: startedAt ? new Date(startedAt) : undefined,
      completedAt:
        completedAt === null
          ? null
          : completedAt
            ? new Date(completedAt)
            : undefined,
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/phases/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new PhaseRepository();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid phase ID" });
      return;
    }

    const deleted = await repo.delete(id);
    if (!deleted) {
      res.status(404).json({ error: `Phase ${id} not found` });
      return;
    }

    res.json({ message: `Phase ${id} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
