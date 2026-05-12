import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSharedMcpTools } from "../../tools/mcpAdapter";

export function registerProjectTools(server: McpServer): void {
  registerSharedMcpTools(server, [
    "get_projects",
    "create_project",
    "update_project",
  ]);
}
