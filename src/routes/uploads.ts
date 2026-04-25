import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { ProjectRepository } from "../repository/ProjectRepository";
import { TicketRepository } from "../repository/TicketRepository";
import { saveGlobalImage, saveTicketImage } from "../lib/fileStorage";

const router = Router();

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// POST /api/uploads/projects/:id/logo
router.post("/projects/:id/logo", logoUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded (field: file)" });
      return;
    }

    const repo = new ProjectRepository();
    const project = await repo.findById(id);
    if (!project) {
      res.status(404).json({ error: `Project ${id} not found` });
      return;
    }

    const logoPath = await saveGlobalImage(`project-${id}`, file.buffer, file.originalname);
    await repo.update(id, { logoPath });

    res.json({ logoPath });
  } catch (err: any) {
    const status = err.message?.includes("not allowed") ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/uploads/projects/:id/logo
router.get("/projects/:id/logo", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const repo = new ProjectRepository();
    const project = await repo.findById(id);
    if (!project) {
      res.status(404).json({ error: `Project ${id} not found` });
      return;
    }
    if (!project.logoPath) {
      res.status(404).json({ error: "No logo set for this project" });
      return;
    }
    if (!existsSync(project.logoPath)) {
      res.status(404).json({ error: "Logo file not found on disk" });
      return;
    }

    res.sendFile(project.logoPath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/uploads/tickets/:id/images
router.post("/tickets/:id/images", imageUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded (field: file)" });
      return;
    }

    const ticketRepo = new TicketRepository();
    const ticket = await ticketRepo.findById(id);
    if (!ticket) {
      res.status(404).json({ error: `Ticket ${id} not found` });
      return;
    }

    let uid = ticket.uid;
    if (!uid) {
      uid = randomUUID();
      await ticketRepo.update(id, { uid });
    }

    const imagePath = await saveTicketImage(uid, file.buffer, file.originalname);
    const imageRef = `\n\n![${file.originalname}](${imagePath})`;
    const newDescription = (ticket.description ?? "") + imageRef;
    await ticketRepo.update(id, { description: newDescription });

    res.json({ path: imagePath, description: newDescription });
  } catch (err: any) {
    const status = err.message?.includes("not allowed") ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// GET /api/uploads/tickets/:id/images/:name
router.get("/tickets/:id/images/:name", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const { basename } = await import("path");
    const name = req.params.name as string;
    if (name !== basename(name)) {
      res.status(400).json({ error: "Invalid file name" });
      return;
    }

    const ticketRepo = new TicketRepository();
    const ticket = await ticketRepo.findById(id);
    if (!ticket || !ticket.uid) {
      res.status(404).json({ error: `Ticket ${id} not found` });
      return;
    }

    const { getTicketImagesDir } = await import("../lib/paths");
    const { join } = await import("path");
    const filePath = join(getTicketImagesDir(ticket.uid), name);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
