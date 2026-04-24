import { CliType } from "../enum/CliType";

export interface SpawnArgs {
  prompt: string;
  resumeSessionId?: string | null;
}

export interface ParsedEvent {
  sessionId?: string;
  textChunk?: string;
  finalText?: string;
  raw: unknown;
}

export interface CliAdapter {
  type: CliType;
  binary: string;
  buildArgs(a: SpawnArgs): string[];
  parseEvent(line: string): ParsedEvent | null;
}
