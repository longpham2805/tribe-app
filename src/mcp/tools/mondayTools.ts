import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSharedMcpTools } from "../../tools/mcpAdapter";

export function registerMondayTools(server: McpServer): void {
  registerSharedMcpTools(server, [
    "monday_not_started_tickets",
    "monday_import_ticket",
  ]);
}
