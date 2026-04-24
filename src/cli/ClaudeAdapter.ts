import { CliType } from "../enum/CliType";
import type { CliAdapter, SpawnArgs, ParsedEvent } from "./CliAdapter";

export class ClaudeAdapter implements CliAdapter {
  type = CliType.CLAUDE;
  binary = "claude";

  buildArgs({ prompt, resumeSessionId }: SpawnArgs): string[] {
    return resumeSessionId
      ? ["-p", prompt, "--resume", resumeSessionId, "--output-format", "stream-json", "--verbose"]
      : ["-p", prompt, "--output-format", "stream-json", "--verbose"];
  }

  parseEvent(line: string): ParsedEvent | null {
    if (!line.trim()) return null;
    try {
      const evt = JSON.parse(line);
      let sessionId: string | undefined;
      let textChunk: string | undefined;
      let finalText: string | undefined;

      if (typeof evt.session_id === "string") sessionId = evt.session_id;

      if (evt.type === "assistant" && evt.message?.content) {
        const chunks = (evt.message.content as any[])
          .filter((b: any) => b?.type === "text" && typeof b.text === "string")
          .map((b: any) => b.text as string);
        if (chunks.length) textChunk = chunks.join("");
      } else if (evt.type === "result" && typeof evt.result === "string") {
        finalText = evt.result;
      }

      return { sessionId, textChunk, finalText, raw: evt };
    } catch {
      return { textChunk: line + "\n", raw: { type: "raw", text: line } };
    }
  }
}
