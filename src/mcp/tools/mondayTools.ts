import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CliType } from "../../enum/CliType";
import { TicketStatus } from "../../enum/TicketStatus";
import { MondayHelper } from "../../monday/MondayHelper";
import { ProjectRepository } from "../../repository/ProjectRepository";
import { MondayImportService } from "../../service/MondayImportService";

const TICKET_STATUS_VALUES = Object.values(TicketStatus) as [string, ...string[]];
const CLI_TYPE_VALUES = Object.values(CliType) as [string, ...string[]];

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
      cliType: z.enum(CLI_TYPE_VALUES).optional().describe("CLI type to use for new READY tickets"),
      status: z.enum(TICKET_STATUS_VALUES).optional().describe("Ticket readiness status"),
      clues: z.string().optional().describe("Additional context saved as ticket description"),
      titleOverride: z.string().optional().describe("Override Monday item title for the local ticket"),
    },
    async ({ mondayItemId, projectId, cliType, status, clues, titleOverride }) => {
      try {
        const result = await new MondayImportService().importTicket({
          mondayItemId,
          projectId: projectId ?? null,
          cliType: cliType as CliType | undefined,
          status: (status as TicketStatus | undefined) ?? TicketStatus.READY,
          ...(clues ? { clues } : {}),
          ...(titleOverride ? { titleOverride } : {}),
          activationContext: "mcp-monday-import",
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
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
