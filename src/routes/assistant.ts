import { Router, type Request, type Response } from "express";
import { AssistantAgentService } from "../assistant/AssistantAgentService";
import { AssistantMessageRepository, AssistantActionRepository } from "../assistant/AssistantRepository";
import { emit } from "../lib/events";
import type { AssistantMessageEmbed } from "../shared/assistantEmbed";

const router = Router();

// GET /api/assistant/messages?unreadOnly=true&ticketId=5
router.get("/messages", async (req: Request, res: Response) => {
  try {
    const repo = new AssistantMessageRepository();
    const unreadOnly = req.query.unreadOnly === "true";
    const ticketId = req.query.ticketId ? parseInt(req.query.ticketId as string, 10) : undefined;
    const messages = await repo.findRecent({ unreadOnly, ticketId });
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assistant/messages/:id/read
router.post("/messages/:id/read", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const repo = new AssistantMessageRepository();
    const msg = await repo.findById(id);
    if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
    await repo.markRead(id);
    const updated = await repo.findById(id);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assistant/chat
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { message, projectId, embeds, imageEmbeds } = req.body;
    const suppliedEmbeds = normalizeChatEmbeds(embeds ?? imageEmbeds);
    if (typeof message !== "string" || (!message.trim() && suppliedEmbeds.length === 0)) {
      res.status(400).json({ error: "message or image is required" });
      return;
    }
    const agent = new AssistantAgentService();
    const reply = await agent.handleUserMessage({
      message: message.trim() || "Uploaded image(s).",
      projectId,
      metadata: { origin: "tribe_ui" },
      embeds: suppliedEmbeds.length > 0 ? suppliedEmbeds : null,
    });
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assistant/actions?status=proposed
router.get("/actions", async (req: Request, res: Response) => {
  try {
    const repo = new AssistantActionRepository();
    const actions = await repo.findPending();
    res.json(actions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assistant/actions/:id/approve
router.post("/actions/:id/approve", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const agent = new AssistantAgentService();
    const result = await agent.executeApprovedAction(id);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    const repo = new AssistantActionRepository();
    const action = await repo.findById(id);
    res.json(action);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assistant/actions/:id/reject
router.post("/actions/:id/reject", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const repo = new AssistantActionRepository();
    const action = await repo.findById(id);
    if (!action) { res.status(404).json({ error: "Action not found" }); return; }
    if (action.status !== "proposed") {
      res.status(400).json({ error: `Action is ${action.status}, not proposed` });
      return;
    }
    await repo.updateStatus(id, "rejected");
    const updated = await repo.findById(id);
    if (updated) emit({ type: "assistant.action.updated", action: updated });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

function normalizeChatEmbeds(value: unknown): AssistantMessageEmbed[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AssistantMessageEmbed => {
    if (!item || typeof item !== "object") return false;
    const embed = item as Partial<Extract<AssistantMessageEmbed, { type: "image" }>>;
    return (
      embed.type === "image" &&
      typeof embed.url === "string" &&
      embed.url.startsWith("/api/uploads/assistant/images/") &&
      (embed.name === undefined || typeof embed.name === "string") &&
      (embed.mimeType === undefined || typeof embed.mimeType === "string") &&
      (embed.size === undefined || typeof embed.size === "number")
    );
  });
}
