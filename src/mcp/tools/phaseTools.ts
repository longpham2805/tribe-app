import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSharedMcpTools } from "../../tools/mcpAdapter";

export function registerPhaseTools(server: McpServer): void {
  registerSharedMcpTools(server, [
    "list_phases",
    "get_phase",
    "create_phase",
    "update_phase",
    "delete_phase",
    "trigger_phase",
    "publish_ticket",
    "respond_phase",
  ]);
}
