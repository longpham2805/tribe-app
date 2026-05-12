import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSharedMcpTools } from "../../tools/mcpAdapter";

export function registerTicketTools(server: McpServer): void {
  registerSharedMcpTools(server, [
    "list_tickets",
    "get_ticket",
    "create_ticket",
    "update_ticket",
    "delete_ticket",
  ]);
}
