import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TicketStatus } from "../../enum/TicketStatus";
import { MondayHelper } from "../../monday/MondayHelper";
import { formatItemMarkdown } from "../../monday/formatItemMarkdown";
import { ProjectRepository } from "../../repository/ProjectRepository";
import { TicketRepository } from "../../repository/TicketRepository";
import { TicketActivationService } from "../../service/TicketActivationService";

const TICKET_STATUS_VALUES = Object.values(TicketStatus) as [string, ...string[]];

export function registerMondayTools(server: McpServer): void {
  server.tool(
    "monday_not_started_tickets",
    "Fetch all not-started tickets from Monday.com (groups: Dev Bugs, Prod Bugs Next, Next)",
    {
      projectId: z.number().optional().describe("Use this project's Monday board settings"),
      boardIds: z
        .array(z.number())
        .optional()
        .describe("Override board IDs (takes precedence over projectId)"),
      people: z
        .array(z.string())
        .optional()
        .describe("Filter by people names/IDs"),
    },
    async ({ projectId, boardIds, people }) => {
      try {
        let monday: MondayHelper;
        if (projectId != null) {
          const project = await new ProjectRepository().findById(projectId);
          monday = new MondayHelper({
            accessToken: process.env.MONDAY_ACCESS_TOKEN,
            apiUrl: process.env.MONDAY_API_URL,
            defaultBoardIds: boardIds ?? (project?.mondayBoardIds ?? undefined),
            ewebinarDevPeople: project?.mondayDevPeople ?? undefined,
          });
        } else {
          monday = MondayHelper.fromEnv();
        }
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
      projectId: z.number().optional().describe("Project to import the ticket into"),
      status: z.enum(TICKET_STATUS_VALUES).optional().describe("Ticket readiness status"),
    },
    async ({ mondayItemId, projectId, status }) => {
      try {
        const ticketStatus = (status as TicketStatus | undefined) ?? TicketStatus.READY;
        const monday = MondayHelper.fromEnv();
        const { item } = await monday.getItemDetails(mondayItemId);
        const markdown = formatItemMarkdown(item);
        const ticketRepo = new TicketRepository();
        const existing = await ticketRepo.findByMondayItemId(item.id);

        let ticket;
        if (existing) {
          ticket = await ticketRepo.update(existing.id, {
            title: item.name,
            mondayMarkdown: markdown,
            status: ticketStatus,
          });
        } else {
          ticket = await ticketRepo.create({
            title: item.name,
            mondayItemId: item.id,
            mondayMarkdown: markdown,
            projectId: projectId ?? null,
            status: ticketStatus,
          });

          ticket = await ticketRepo.findById(ticket.id);
        }

        if (!existing) {
          new TicketActivationService().activateCreatedIfReady(ticket, "mcp-monday-import");
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
}
