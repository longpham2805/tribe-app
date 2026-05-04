import { existsSync, readFileSync, statSync } from "fs";
import type { SpawnResult } from "./phaseCli";

export interface OutputArtifactSnapshot {
  exists: boolean;
  size?: number;
  mtimeMs?: number;
  content?: string;
}

export interface SelectedPhaseOutput {
  result: SpawnResult;
  source: "file" | "stdout";
}

export function snapshotOutputArtifact(path: string): OutputArtifactSnapshot {
  if (!existsSync(path)) return { exists: false };

  const stat = statSync(path);
  return {
    exists: true,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    content: readFileSync(path, "utf-8"),
  };
}

export function selectPhaseOutputResult(
  result: SpawnResult,
  path: string,
  before: OutputArtifactSnapshot,
): SelectedPhaseOutput {
  if (!outputArtifactChanged(path, before)) {
    return { result, source: "stdout" };
  }

  return {
    result: {
      ...result,
      output: readFileSync(path, "utf-8"),
    },
    source: "file",
  };
}

function outputArtifactChanged(path: string, before: OutputArtifactSnapshot): boolean {
  if (!existsSync(path)) return false;
  if (!before.exists) return true;

  const stat = statSync(path);
  if (stat.size !== before.size || stat.mtimeMs !== before.mtimeMs) return true;

  return readFileSync(path, "utf-8") !== before.content;
}
