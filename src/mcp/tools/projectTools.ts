import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProjectRepository } from "../../repository/ProjectRepository";

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
}
