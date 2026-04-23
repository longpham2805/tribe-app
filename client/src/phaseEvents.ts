export function extractAssistantText(evt: any): string {
  if (!evt) return "";
  if (evt.type === "assistant" && evt.message?.content) {
    return evt.message.content
      .filter((block: any) => block?.type === "text" && typeof block.text === "string")
      .map((block: any) => block.text)
      .join("");
  }
  if (evt.type === "result" && typeof evt.result === "string") return evt.result;
  return "";
}
