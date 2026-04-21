import { Router, type Request, type Response } from "express";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { TicketPhase } from "../enum/TicketPhase";
import { MondayHelper } from "../monday/MondayHelper";
import { formatItemMarkdown } from "../monday/formatItemMarkdown";

const router = Router();

// GET /api/monday/not-started?boardIds=1,2&people=alice,bob
router.get("/not-started", async (req: Request, res: Response) => {
  try {
    const monday = MondayHelper.fromEnv();

    const boardIds = req.query.boardIds
      ? String(req.query.boardIds)
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n))
      : undefined;

    const people = req.query.people
      ? String(req.query.people)
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;

    const { items } = await monday.getNotStartedItems({
      boardIds,
      peopleOverride: people,
    });

    res.json({ count: items.length, items });
  } catch (err: any) {
    res.status(502).json({ error: `Monday API error: ${err.message}` });
  }
});

// POST /api/monday/import  { mondayItemId: string }
router.post("/import", async (req: Request, res: Response) => {
  try {
    const { mondayItemId } = req.body;
    if (!mondayItemId || typeof mondayItemId !== "string") {
      res.status(400).json({ error: "mondayItemId (string) is required — numeric ID or Monday URL" });
      return;
    }

    // 1. Fetch from Monday
    const monday = MondayHelper.fromEnv();
    const { item } = await monday.getItemDetails(mondayItemId);

    // 2. Convert to structured markdown
    const markdown = formatItemMarkdown(item);

    // 3. Upsert into DB
    const ticketRepo = new TicketRepository();
    const phaseRepo = new PhaseRepository();
    const existing = await ticketRepo.findByMondayItemId(item.id);

    let ticket;
    let action: "created" | "updated";

    if (existing) {
      ticket = await ticketRepo.update(existing.id, {
        title: item.name,
        mondayMarkdown: markdown,
      });
      action = "updated";
    } else {
      ticket = await ticketRepo.create({
        title: item.name,
        mondayItemId: item.id,
        mondayMarkdown: markdown,
      });

      await phaseRepo.create({
        ticketId: ticket.id,
        phaseName: TicketPhase.CREATED,
      });

      ticket = await ticketRepo.findById(ticket.id);
      action = "created";
    }

    res.status(action === "created" ? 201 : 200).json({
      action,
      ticket,
      mondayMarkdown: markdown,
    });
  } catch (err: any) {
    res.status(502).json({ error: `Import error: ${err.message}` });
  }
});

export default router;
