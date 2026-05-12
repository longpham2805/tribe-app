import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildToolSchema } from "./schema";
import { executeToolCommand, getMcpToolCommands, resultToMcpText } from "./commands";

export function registerSharedMcpTools(server: McpServer, names?: string[]): void {
  const selected = new Set(names);
  for (const command of getMcpToolCommands()) {
    if (names && !selected.has(command.name)) continue;
    const schema = buildToolSchema(command.input);
    server.tool(
      command.name,
      command.description,
      schema.zodShape,
      async (input) => {
        const result = await executeToolCommand(command.name, input as Record<string, unknown>, {
          source: "mcp",
          confirmed: true,
        });
        const response = resultToMcpText(result);
        return {
          content: [{ type: "text" as const, text: response.text }],
          ...(response.isError ? { isError: true } : {}),
        };
      },
    );
  }
}
