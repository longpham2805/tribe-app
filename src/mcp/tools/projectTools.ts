import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ProjectRepository } from "../../repository/ProjectRepository";
import { AssistantProjectSlotWriteService } from "../../assistant/AssistantProjectSlotWriteService";

export function registerProjectTools(server: McpServer): void {
  server.tool(
    "get_projects",
    "List all projects with their Monday board settings",
    {},
    async () => {
      const repo = new ProjectRepository();
      const projects = await repo.findAll();
      return {
        content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
      };
    },
  );

  server.tool(
    "create_project",
    "Create a project with validated settings. Trusted MCP clients execute directly; UI assistant writes may use approval gates.",
    {
      name: z.string().describe("Project name"),
      slug: z.string().nullable().optional().describe("Optional unique project slug"),
      mondayBoardIds: z.array(z.number()).nullable().optional().describe("Optional Monday board IDs"),
      mondayDefaultPersonId: z.string().nullable().optional().describe("Optional Monday default person ID"),
      mondayDevPeople: z.array(z.string()).nullable().optional().describe("Optional Monday people names/IDs"),
      primaryColor: z.string().nullable().optional().describe("Optional #RRGGBB primary color"),
      actionColor: z.string().nullable().optional().describe("Optional #RRGGBB action color"),
      introduction: z.string().nullable().optional().describe("Optional assistant project introduction"),
      rules: z.string().nullable().optional().describe("Optional assistant project rules"),
      techStack: z.string().nullable().optional().describe("Optional assistant project tech stack"),
      fastTrack: z.boolean().optional().describe("Optional fast-track setting"),
    },
    async (input) => {
      const service = new AssistantProjectSlotWriteService();
      const result = await service.execute({ operation: "create_project", input });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "update_project",
    "Update project settings with the same validation contract as assistant writes. Caller owns confirmation in trusted MCP contexts.",
    {
      projectId: z.number().describe("Project ID to update"),
      name: z.string().optional().describe("New project name"),
      slug: z.string().nullable().optional().describe("New unique project slug, or null to clear"),
      mondayBoardIds: z.array(z.number()).nullable().optional().describe("Monday board IDs, or null to clear"),
      mondayDefaultPersonId: z.string().nullable().optional().describe("Monday default person ID, or null to clear"),
      mondayDevPeople: z.array(z.string()).nullable().optional().describe("Monday people names/IDs, or null to clear"),
      primaryColor: z.string().nullable().optional().describe("#RRGGBB primary color, or null to clear"),
      actionColor: z.string().nullable().optional().describe("#RRGGBB action color, or null to clear"),
      introduction: z.string().nullable().optional().describe("Assistant project introduction, or null to clear"),
      rules: z.string().nullable().optional().describe("Assistant project rules, or null to clear"),
      techStack: z.string().nullable().optional().describe("Assistant project tech stack, or null to clear"),
      fastTrack: z.boolean().optional().describe("Fast-track setting"),
    },
    async ({ projectId, ...input }) => {
      const service = new AssistantProjectSlotWriteService();
      const result = await service.execute({ operation: "update_project", projectId, input });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
