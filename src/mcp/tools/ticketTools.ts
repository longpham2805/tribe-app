import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CliType } from "../../enum/CliType";
import { TicketPhase } from "../../enum/TicketPhase";
import { TicketStatus } from "../../enum/TicketStatus";
import { TicketRepository } from "../../repository/TicketRepository";
import { TicketMutationService } from "../../service/tickets/TicketMutationService";

const PHASE_VALUES = Object.values(TicketPhase) as [string, ...string[]];
const TICKET_STATUS_VALUES = Object.values(TicketStatus) as [string, ...string[]];
const CLI_TYPE_VALUES = Object.values(CliType) as [string, ...string[]];

export function registerTicketTools(server: McpServer): void {
  server.tool(
    "list_tickets",
    "List all tickets, optionally filtered by phase and project",
    {
      phase: z.enum(PHASE_VALUES).optional().describe("Filter by current phase"),
      projectId: z.number().optional().describe("Filter by project ID"),
    },
    async ({ phase, projectId }) => {
      const repo = new TicketRepository();
      const opts = projectId != null ? { projectId } : undefined;
      const tickets = phase
        ? await repo.findByPhase(phase as TicketPhase, opts)
        : await repo.findAll(opts);
      return {
        content: [{ type: "text", text: JSON.stringify(tickets, null, 2) }],
      };
    },
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
    },
  );

  server.tool(
    "create_ticket",
    "Create a new ticket",
    {
      title: z.string().describe("Short summary of the work"),
      description: z.string().optional().describe("Detailed description"),
      projectId: z.number().nullable().optional().describe("Project ID to assign, or null for none"),
      cliType: z.enum(CLI_TYPE_VALUES).optional().describe("CLI type to use when READY"),
      status: z.enum(TICKET_STATUS_VALUES).optional().describe("Ticket readiness status"),
    },
    async ({ title, description, projectId, cliType, status }) => {
      try {
        const full = await new TicketMutationService().create({
          title,
          description,
          projectId: projectId ?? null,
          cliType: cliType as CliType | undefined,
          status: (status as TicketStatus | undefined) ?? TicketStatus.READY,
          activationContext: "mcp-ticket-create",
        });
        return {
          content: [{ type: "text", text: JSON.stringify(full, null, 2) }],
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
    "update_ticket",
    "Update a ticket's title, description, or current phase",
    {
      id: z.number().describe("Ticket ID"),
      title: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      currentPhase: z.enum(PHASE_VALUES).optional().describe("Move ticket to this phase"),
      status: z.enum(TICKET_STATUS_VALUES).optional().describe("Ticket readiness status"),
    },
    async ({ id, title, description, currentPhase, status }) => {
      try {
        const full = await new TicketMutationService().update({
          id,
          title,
          description,
          currentPhase: currentPhase as TicketPhase | undefined,
          status: status as TicketStatus | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(full, null, 2) }],
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
    },
  );
}
