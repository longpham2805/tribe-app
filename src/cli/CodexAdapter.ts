/*
 * Codex CLI (OpenAI) — non-interactive exec mode
 *
 * New session:
 *   codex exec --json --dangerously-bypass-approvals-and-sandbox <prompt>
 *
 * Resume session:
 *   codex exec resume <sessionId> <prompt> --json --dangerously-bypass-approvals-and-sandbox
 *
 * JSONL event shapes (relevant subset):
 *   {"type":"thread.started","thread_id":"<uuid>"}
 *   {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
 *   {"type":"turn.completed","usage":{...}}
 *
 * There is no final consolidated result field; text accumulates via agent_message items.
 */
import { CliType } from "../enum/CliType";
import type { CliAdapter, SpawnArgs, ParsedEvent } from "./CliAdapter";

export class CodexAdapter implements CliAdapter {
  type = CliType.CODEX;
  binary = "codex";

  buildArgs({ prompt, resumeSessionId }: SpawnArgs): string[] {
    return resumeSessionId
      ? ["exec", "resume", resumeSessionId, prompt, "--json", "--dangerously-bypass-approvals-and-sandbox"]
      : ["exec", "--json", "--dangerously-bypass-approvals-and-sandbox", prompt];
  }

  parseEvent(line: string): ParsedEvent | null {
    if (!line.trim()) return null;
    try {
      const evt = JSON.parse(line);
      let sessionId: string | undefined;
      let textChunk: string | undefined;

      if (evt.type === "thread.started" && typeof evt.thread_id === "string") {
        sessionId = evt.thread_id;
      }

      if (
        evt.type === "item.completed" &&
        evt.item?.type === "agent_message" &&
        typeof evt.item.text === "string"
      ) {
        textChunk = evt.item.text;
      }

      return { sessionId, textChunk, raw: evt };
    } catch {
      return { textChunk: line + "\n", raw: { type: "raw", text: line } };
    }
  }
}
