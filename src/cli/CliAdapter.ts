import { CliType } from "../enum/CliType";
import type { PhaseLogEvent } from "../shared/events";

export interface SpawnArgs {
  prompt: string;
  resumeSessionId?: string | null;
}

export interface ParsedEvent {
  sessionId?: string;
  textChunk?: string;
  finalText?: string;
  raw: PhaseLogEvent;
}

export interface CliAdapter {
  type: CliType;
  binary: string;
  buildArgs(a: SpawnArgs): string[];
  parseEvent(line: string): ParsedEvent | null;
}
