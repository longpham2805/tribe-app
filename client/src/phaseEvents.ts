function formatSystemEvent(evt: any): string {
  if (evt?.type !== "system" || evt.source !== "PhaseHandler" || typeof evt.message !== "string") {
    return "";
  }
  const at = typeof evt.at === "string" ? evt.at : null;
  const time = at ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  return `**PhaseHandler${time ? ` ${time}` : ""}:** ${evt.message}`;
}

export function extractEventText(evt: any): string {
  if (!evt) return "";
  if (evt.type === "_tribe.run_start") return "_Run started_";
  if (evt.type === "system") return formatSystemEvent(evt);
  if (evt.type === "user_message") return `**You:** ${evt.text}`;
  if (evt.type === "raw" && typeof evt.text === "string") return evt.text;
  if (evt.type === "result" && typeof evt.result === "string") return evt.result;
  if (evt.type === "assistant" && evt.message?.content) {
    return evt.message.content
      .map((block: any) => {
        if (block?.type === "text") return block.text;
        if (block?.type === "thinking") return `_Thinking…_`;
        if (block?.type === "tool_use") {
          const inp = block.input ?? {};
          let detail = "";
          switch (block.name) {
            case "Read":
              detail = inp.file_path ? ` \`${inp.file_path.replace(/.*\//, "")}\`` : "";
              break;
            case "Edit":
            case "Write":
              detail = inp.file_path ? ` \`${inp.file_path.replace(/.*\//, "")}\`` : "";
              break;
            case "Bash":
              detail = inp.command ? ` \`${String(inp.command).slice(0, 60)}\`` : "";
              break;
            case "Grep":
              detail = inp.pattern ? ` \`${inp.pattern}\`` + (inp.path ? ` in \`${inp.path}\`` : "") : "";
              break;
            case "Glob":
              detail = inp.pattern ? ` \`${inp.pattern}\`` : "";
              break;
            case "Agent":
              detail = inp.description ? ` — ${inp.description}` : "";
              break;
            case "WebFetch":
            case "WebSearch":
              detail = inp.url ? ` ${inp.url}` : inp.query ? ` \`${inp.query}\`` : "";
              break;
            default:
              if (inp.file_path) detail = ` \`${inp.file_path.replace(/.*\//, "")}\``;
              else if (inp.command) detail = ` \`${String(inp.command).slice(0, 60)}\``;
          }
          return `🔧 **${block.name}**${detail}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

export const extractAssistantText = extractEventText;
