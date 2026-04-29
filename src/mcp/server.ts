import "reflect-metadata";
import { randomUUID } from "crypto";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import express from "express";
import { AppDataSource } from "../data-source";
import ticketRoutes from "../routes/tickets";
import phaseRoutes from "../routes/phases";
import mondayRoutes from "../routes/monday";
import slotRoutes from "../routes/slots";
import projectRoutes from "../routes/projects";
import appStateRoutes from "../routes/appState";
import filesRoutes from "../routes/files";
import uploadsRoutes from "../routes/uploads";
import { attachWebSocket } from "../ws/server";
import { registerTicketTools } from "./tools/ticketTools";
import { registerPhaseTools } from "./tools/phaseTools";
import { registerMondayTools } from "./tools/mondayTools";
import { registerSlotTools } from "./tools/slotTools";
import { registerProjectTools } from "./tools/projectTools";

function createServer(): McpServer {
  const server = new McpServer({
    name: "tribe",
    version: "1.0.0",
  });

  registerTicketTools(server);
  registerPhaseTools(server);
  registerMondayTools(server);
  registerSlotTools(server);
  registerProjectTools(server);

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
  app.use("/api/projects", projectRoutes);
  app.use("/api/app-state", appStateRoutes);
  app.use("/api/uploads", uploadsRoutes);

  // ── SPA Static Files ─────────────────────────────────────────────
  const publicDir = path.join(__dirname, "../../public");
  app.use(express.static(publicDir));
  app.get(/^(?!\/api|\/mcp).*$/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  const PORT = parseInt(process.env.MCP_PORT || "8100");
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
