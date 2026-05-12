import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSharedMcpTools } from "../../tools/mcpAdapter";

export function registerSlotTools(server: McpServer): void {
  registerSharedMcpTools(server, [
    "list_slots",
    "create_slot",
    "update_slot",
  ]);
}
