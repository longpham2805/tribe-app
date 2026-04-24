import { Router, type Request, type Response } from "express";
import { ProjectRepository } from "../repository/ProjectRepository";

const router = Router();

// GET /api/projects
router.get("/", async (_req: Request, res: Response) => {
  try {
    const repo = new ProjectRepository();
    const projects = await repo.findAllWithActivity();
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new ProjectRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const project = await repo.findByIdWithActivity(id);
    if (!project) {
      res.status(404).json({ error: `Project ${id} not found` });
      return;
    }
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects  { name, slug?, mondayBoardIds?, mondayDefaultPersonId?, mondayDevPeople? }
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, slug, mondayBoardIds, mondayDefaultPersonId, mondayDevPeople } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const repo = new ProjectRepository();
    const project = await repo.create({ name, slug, mondayBoardIds, mondayDefaultPersonId, mondayDevPeople });
    res.status(201).json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/projects/:id
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new ProjectRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const { name, slug, mondayBoardIds, mondayDefaultPersonId, mondayDevPeople } = req.body;
    const updated = await repo.update(id, { name, slug, mondayBoardIds, mondayDefaultPersonId, mondayDevPeople });
    if (!updated) {
      res.status(404).json({ error: `Project ${id} not found` });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id  (only if empty)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const repo = new ProjectRepository();
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const result = await repo.delete(id);
    if (!result.ok) {
      const status = result.error?.includes("not found") ? 404 : 409;
      res.status(status).json({ error: result.error });
      return;
    }
    res.json({ message: `Project ${id} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
