import { Router, type Request, type Response } from "express";
import { readdirSync, existsSync, statSync, readFileSync } from "fs";
import { join, basename } from "path";
import { TicketRepository } from "../repository/TicketRepository";
import { getTicketDir, getLogFile } from "../lib/paths";

const router = Router({ mergeParams: true });

// GET /api/tickets/:ticketId/files
router.get("/", async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.ticketId as string, 10);
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const ticket = await new TicketRepository().findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: `Ticket ${ticketId} not found` });
      return;
    }
    if (!ticket.uid) {
      res.json([]);
      return;
    }

    const dir = getTicketDir(ticket.uid);
    if (!existsSync(dir)) {
      res.json([]);
      return;
    }

    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => {
        const full = join(dir, e.name);
        const stat = statSync(full);
        return { name: e.name, size: stat.size, mtime: stat.mtime.toISOString() };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:ticketId/files/_logs/:phaseName  (tail of jsonl log — declared before /:name)
router.get("/_logs/:phaseName", async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.ticketId as string, 10);
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const phaseName = req.params.phaseName as string;
    if (phaseName !== basename(phaseName)) {
      res.status(400).json({ error: "Invalid phase name" });
      return;
    }

    const ticket = await new TicketRepository().findById(ticketId);
    if (!ticket || !ticket.uid) {
      res.status(404).json({ error: `Ticket ${ticketId} not found` });
      return;
    }

    const logPath = getLogFile(ticket.uid, phaseName);
    if (!existsSync(logPath)) {
      res.json({ events: [] });
      return;
    }

    const raw = readFileSync(logPath, "utf-8");
    const events = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { type: "raw", text: line };
        }
      });

    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:ticketId/files/:name
router.get("/:name", async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.ticketId as string, 10);
    if (isNaN(ticketId)) {
      res.status(400).json({ error: "Invalid ticket ID" });
      return;
    }

    const name = req.params.name as string;
    // Guard against path traversal.
    if (name !== basename(name) || !name.endsWith(".md")) {
      res.status(400).json({ error: "Invalid file name" });
      return;
    }

    const ticket = await new TicketRepository().findById(ticketId);
    if (!ticket || !ticket.uid) {
      res.status(404).json({ error: `Ticket ${ticketId} not found` });
      return;
    }

    const filePath = join(getTicketDir(ticket.uid), name);
    if (!existsSync(filePath)) {
      res.status(404).json({ error: `File ${name} not found` });
      return;
    }

    const content = readFileSync(filePath, "utf-8");
    res.type("text/markdown").send(content);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
