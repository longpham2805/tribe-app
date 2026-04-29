import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SlotRepository } from "../../repository/SlotRepository";

export function registerSlotTools(server: McpServer): void {
  server.tool(
    "list_slots",
    "List all workspace slots with their current ticket assignment and free/occupied status",
    {
      projectId: z.number().optional().describe("Filter slots by project ID"),
    },
    async ({ projectId }) => {
      const repo = new SlotRepository();
      const slots = await repo.findAll(projectId != null ? { projectId } : undefined);
      const result = slots.map((slot) => ({
        id: slot.id,
        name: slot.name,
        rootPath: slot.rootPath,
        projectId: slot.projectId,
        status: slot.currentTicketId ? "occupied" : "free",
        currentTicketId: slot.currentTicketId,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
