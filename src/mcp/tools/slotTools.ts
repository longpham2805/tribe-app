import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SlotRepository } from "../../repository/SlotRepository";
import { AssistantProjectSlotWriteService } from "../../assistant/AssistantProjectSlotWriteService";

export function registerSlotTools(server: McpServer): void {
  server.tool(
    "list_slots",
    "List all workspace slots with their current ticket assignment and disabled/occupied/free status",
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
        disabled: slot.disabled,
        status: slot.disabled ? "disabled" : slot.currentTicketId ? "occupied" : "free",
        currentTicketId: slot.currentTicketId,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "create_slot",
    "Create a workspace slot with validated name, absolute rootPath, and optional project assignment. Trusted MCP clients execute directly.",
    {
      name: z.string().describe("Slot name"),
      rootPath: z.string().describe("Absolute workspace root path; this tool does not create directories"),
      projectId: z.number().nullable().optional().describe("Project ID, or null for unassigned"),
    },
    async (input) => {
      const service = new AssistantProjectSlotWriteService();
      const result = await service.execute({ operation: "create_slot", input });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "update_slot",
    "Update workspace slot name, absolute rootPath, project assignment, or disabled state. Caller owns confirmation in trusted MCP contexts.",
    {
      slotId: z.number().describe("Slot ID to update"),
      name: z.string().optional().describe("New slot name"),
      rootPath: z.string().optional().describe("New absolute workspace root path"),
      projectId: z.number().nullable().optional().describe("Project ID, or null to unassign"),
      disabled: z.boolean().optional().describe("True blocks new ticket assignment without stopping current work"),
    },
    async ({ slotId, ...input }) => {
      const service = new AssistantProjectSlotWriteService();
      const result = await service.execute({ operation: "update_slot", slotId, input });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
