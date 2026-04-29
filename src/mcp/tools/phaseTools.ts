import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TicketPhase } from "../../enum/TicketPhase";
import { PhaseHandler } from "../../handler/PhaseHandler";
import { PhaseRepository } from "../../repository/PhaseRepository";

const PHASE_VALUES = Object.values(TicketPhase) as [string, ...string[]];

export function registerPhaseTools(server: McpServer): void {
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
    },
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
    },
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
    },
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
    },
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
    },
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
    },
  );

  server.tool(
    "publish_ticket",
    "Publish a draft ticket so it can enter the workflow. Existing update_ticket status=READY behavior remains supported.",
    { ticketId: z.number().describe("Ticket ID") },
    async ({ ticketId }) => {
      try {
        const handler = new PhaseHandler();
        const result = await handler.publish(ticketId);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: err.message }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "respond_phase",
    "Send a response message to the active phase handler for a ticket.",
    {
      ticketId: z.number().describe("Ticket ID"),
      message: z.string().describe("Response message for the active phase"),
    },
    async ({ ticketId, message }) => {
      try {
        const handler = new PhaseHandler();
        const result = await handler.respond(ticketId, message);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: err.message }],
          isError: true,
        };
      }
    },
  );
}
