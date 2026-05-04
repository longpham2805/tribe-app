import { Router, type Request, type Response } from "express";
import { SlotRepository } from "../repository/SlotRepository";
import { SlotService } from "../service/SlotService";

const router = Router();

// GET /api/slots?projectId=1
router.get("/", async (req: Request, res: Response) => {
  try {
    const repo = new SlotRepository();
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string, 10) : undefined;
    const slots = await repo.findAll(projectId != null && !isNaN(projectId) ? { projectId } : undefined);
    res.json(slots);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/slots/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new SlotRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid slot ID" });
      return;
    }
    const slot = await repo.findById(id);
    if (!slot) {
      res.status(404).json({ error: `Slot ${id} not found` });
      return;
    }
    res.json(slot);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/slots  { name, rootPath, projectId? }
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, rootPath, projectId } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }
    if (!rootPath || typeof rootPath !== "string") {
      res.status(400).json({ error: "rootPath is required" });
      return;
    }

    const repo = new SlotRepository();
    const slot = await repo.create({
      name,
      rootPath,
      projectId: typeof projectId === "number" ? projectId : null,
    });
    res.status(201).json(slot);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/slots/:id  { name?, rootPath?, projectId?, disabled? }
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new SlotRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid slot ID" });
      return;
    }

    const { name, rootPath, projectId, disabled } = req.body;
    if (disabled !== undefined && typeof disabled !== "boolean") {
      res.status(400).json({ error: "disabled must be a boolean" });
      return;
    }

    const updated = await repo.update(id, {
      name,
      rootPath,
      projectId: typeof projectId === "number" || projectId === null ? projectId : undefined,
      disabled,
    });
    if (!updated) {
      res.status(404).json({ error: `Slot ${id} not found` });
      return;
    }

    if (disabled === false && updated.currentTicketId == null) {
      new SlotService().tryResumeQueue(updated.projectId ?? undefined).catch(console.error);
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/slots/:id  (only if slot is free)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new SlotRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid slot ID" });
      return;
    }

    const slot = await repo.findById(id);
    if (!slot) {
      res.status(404).json({ error: `Slot ${id} not found` });
      return;
    }
    if (slot.currentTicketId !== null) {
      res.status(409).json({
        error: `Slot ${id} is currently occupied by ticket #${slot.currentTicketId}. Release it first.`,
      });
      return;
    }

    await repo.delete(id);
    res.json({ message: `Slot ${id} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
