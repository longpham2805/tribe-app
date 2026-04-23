import "reflect-metadata";
import { randomUUID } from "crypto";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import express from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { TicketRepository } from "../repository/TicketRepository";
import { PhaseRepository } from "../repository/PhaseRepository";
import { TicketPhase } from "../enum/TicketPhase";
import { PhaseHandler } from "../handler/PhaseHandler";
import { MondayHelper } from "../monday/MondayHelper";
import { formatItemMarkdown } from "../monday/formatItemMarkdown";
import ticketRoutes from "../routes/tickets";
import phaseRoutes from "../routes/phases";
import mondayRoutes from "../routes/monday";
import slotRoutes from "../routes/slots";
import filesRoutes from "../routes/files";
import { SlotRepository } from "../repository/SlotRepository";
import { attachWebSocket } from "../ws/server";

const PHASE_VALUES = Object.values(TicketPhase) as [string, ...string[]];

function createServer(): McpServer {
  const server = new McpServer({
    name: "tribe",
    version: "1.0.0",
  });

  // ── Ticket Tools ──────────────────────────────────────────────────

  server.tool(
    "list_tickets",
    "List all tickets, optionally filtered by phase",
    { phase: z.enum(PHASE_VALUES).optional().describe("Filter by current phase") },
    async ({ phase }) => {
      const repo = new TicketRepository();
      const tickets = phase
        ? await repo.findByPhase(phase as TicketPhase)
        : await repo.findAll();
      return {
        content: [{ type: "text", text: JSON.stringify(tickets, null, 2) }],
      };
    }
  );

  server.tool(
    "get_ticket",
    "Get a single ticket by ID (includes phase history)",
    { id: z.number().describe("Ticket ID") },
    async ({ id }) => {
      const repo = new TicketRepository();
      const ticket = await repo.findById(id);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket ${id} not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(ticket, null, 2) }],
      };
    }
  );

  server.tool(
    "create_ticket",
    "Create a new ticket",
    {
      title: z.string().describe("Short summary of the work"),
      description: z.string().optional().describe("Detailed description"),
    },
    async ({ title, description }) => {
      const ticketRepo = new TicketRepository();

      const ticket = await ticketRepo.create({ title, description });
      const full = await ticketRepo.findById(ticket.id);
      return {
        content: [{ type: "text", text: JSON.stringify(full, null, 2) }],
      };
    }
  );

  server.tool(
    "update_ticket",
    "Update a ticket's title, description, or current phase",
    {
      id: z.number().describe("Ticket ID"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      currentPhase: z.enum(PHASE_VALUES).optional().describe("Move ticket to this phase"),
    },
    async ({ id, title, description, currentPhase }) => {
      const ticketRepo = new TicketRepository();
      const phaseRepo = new PhaseRepository();

      const existing = await ticketRepo.findById(id);
      if (!existing) {
        return {
          content: [{ type: "text", text: `Ticket ${id} not found` }],
          isError: true,
        };
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

      const updated = await ticketRepo.update(id, {
        title,
        description,
        currentPhase: currentPhase as TicketPhase | undefined,
      });
      const full = await ticketRepo.findById(id);
      return {
        content: [{ type: "text", text: JSON.stringify(full, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_ticket",
    "Delete a ticket and all its phase records",
    { id: z.number().describe("Ticket ID") },
    async ({ id }) => {
      const repo = new TicketRepository();
      const deleted = await repo.delete(id);
      return {
        content: [
          {
            type: "text",
            text: deleted
              ? `Ticket ${id} deleted successfully`
              : `Ticket ${id} not found`,
          },
        ],
        isError: !deleted,
      };
    }
  );

  // ── Phase Tools ───────────────────────────────────────────────────

  server.tool(
    "list_phases",
    "List all phase records for a ticket",
    { ticketId: z.number().describe("Ticket ID") },
    async ({ ticketId }) => {
      const repo = new PhaseRepository();
      const phases = await repo.findByTicketId(ticketId);
      return {
        content: [{ type: "text", text: JSON.stringify(phases, null, 2) }],
      };
    }
  );

  server.tool(
    "get_phase",
    "Get a single phase record by ID",
    { id: z.number().describe("Phase ID") },
    async ({ id }) => {
      const repo = new PhaseRepository();
      const phase = await repo.findById(id);
      if (!phase) {
        return {
          content: [{ type: "text", text: `Phase ${id} not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(phase, null, 2) }],
      };
    }
  );

  server.tool(
    "create_phase",
    "Create a new phase record for a ticket",
    {
      ticketId: z.number().describe("Ticket ID"),
      phaseName: z.enum(PHASE_VALUES).describe("Phase name"),
      startedAt: z.string().optional().describe("ISO datetime string for when the phase started (defaults to now)"),
    },
    async ({ ticketId, phaseName, startedAt }) => {
      const repo = new PhaseRepository();
      const phase = await repo.create({
        ticketId,
        phaseName: phaseName as TicketPhase,
        startedAt: startedAt ? new Date(startedAt) : undefined,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(phase, null, 2) }],
      };
    }
  );

  server.tool(
    "update_phase",
    "Update a phase record (e.g. mark it completed)",
    {
      id: z.number().describe("Phase ID"),
      phaseName: z.enum(PHASE_VALUES).optional().describe("Change phase name"),
      startedAt: z.string().optional().describe("ISO datetime for start"),
      completedAt: z
        .string()
        .nullable()
        .optional()
        .describe("ISO datetime for completion, or null to re-open"),
    },
    async ({ id, phaseName, startedAt, completedAt }) => {
      const repo = new PhaseRepository();
      const existing = await repo.findById(id);
      if (!existing) {
        return {
          content: [{ type: "text", text: `Phase ${id} not found` }],
          isError: true,
        };
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
      return {
        content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_phase",
    "Delete a phase record",
    { id: z.number().describe("Phase ID") },
    async ({ id }) => {
      const repo = new PhaseRepository();
      const deleted = await repo.delete(id);
      return {
        content: [
          {
            type: "text",
            text: deleted
              ? `Phase ${id} deleted successfully`
              : `Phase ${id} not found`,
          },
        ],
        isError: !deleted,
      };
    }
  );

  server.tool(
    "trigger_phase",
    "Transition a ticket to the given phase and run its phase handler. Completes the active phase, activates the pending target phase, and dispatches phase-specific logic.",
    {
      ticketId: z.number().describe("Ticket ID"),
      phaseName: z.enum(PHASE_VALUES).describe("Phase to trigger"),
    },
    async ({ ticketId, phaseName }) => {
      try {
        const handler = new PhaseHandler();
        const result = await handler.trigger(ticketId, phaseName as TicketPhase);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: err.message }],
          isError: true,
        };
      }
    }
  );

  // ── Monday Integration Tools ─────────────────────────────────────

  server.tool(
    "monday_not_started_tickets",
    "Fetch all not-started tickets from Monday.com (groups: Dev Bugs, Prod Bugs Next, Next)",
    {
      boardIds: z
        .array(z.number())
        .optional()
        .describe("Override default board IDs"),
      people: z
        .array(z.string())
        .optional()
        .describe("Filter by people names/IDs"),
    },
    async ({ boardIds, people }) => {
      try {
        const monday = MondayHelper.fromEnv();
        const { items } = await monday.getNotStartedItems({
          boardIds,
          peopleOverride: people,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  count: items.length,
                  items,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Monday API error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "monday_import_ticket",
    "Fetch a Monday.com ticket by ID, convert to structured markdown, and store/update in the database",
    {
      mondayItemId: z
        .string()
        .describe("Monday item ID or Monday item URL"),
    },
    async ({ mondayItemId }) => {
      try {
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
        if (existing) {
          // Update existing ticket
          ticket = await ticketRepo.update(existing.id, {
            title: item.name,
            mondayMarkdown: markdown,
          });
        } else {
          // Create new ticket linked to Monday
          ticket = await ticketRepo.create({
            title: item.name,
            mondayItemId: item.id,
            mondayMarkdown: markdown,
          });

          // Auto-create the initial CREATED phase record
          await phaseRepo.create({
            ticketId: ticket.id,
            phaseName: TicketPhase.CREATED,
          });

          // Re-fetch with relations
          ticket = await ticketRepo.findById(ticket.id);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  action: existing ? "updated" : "created",
                  ticket,
                  mondayMarkdown: markdown,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Import error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ── Slot Tools ────────────────────────────────────────────────────

  server.tool(
    "list_slots",
    "List all workspace slots with their current ticket assignment and free/occupied status",
    {},
    async () => {
      const repo = new SlotRepository();
      const slots = await repo.findAll();
      const result = slots.map((s) => ({
        id: s.id,
        name: s.name,
        rootPath: s.rootPath,
        status: s.currentTicketId ? "occupied" : "free",
        currentTicketId: s.currentTicketId,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
}

// ── HTTP Server Bootstrap ─────────────────────────────────────────────

async function main() {
  await AppDataSource.initialize();
  console.log("Tribe: Database connected.");

  const mcpServer = createServer();
  const app = createMcpExpressApp();

  // Map of active transports by session ID
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Existing session — reuse transport
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — create transport and connect
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    await mcpServer.connect(transport);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // ── REST API Routes ──────────────────────────────────────────────
  app.use("/api", express.json());
  app.use("/api/tickets/:ticketId/files", filesRoutes);
  app.use("/api/tickets", ticketRoutes);
  app.use("/api/phases", phaseRoutes);
  app.use("/api/monday", mondayRoutes);
  app.use("/api/slots", slotRoutes);

  // ── SPA Static Files ─────────────────────────────────────────────
  const publicDir = path.join(__dirname, "../../public");
  app.use(express.static(publicDir));
  app.get(/^(?!\/api|\/mcp).*$/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  const PORT = parseInt(process.env.MCP_PORT || "3100");
  const httpServer = app.listen(PORT, () => {
    console.log(`Tribe MCP server running at http://localhost:${PORT}/mcp`);
    console.log(`Tribe REST API running at http://localhost:${PORT}/api`);
  });
  attachWebSocket(httpServer);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
