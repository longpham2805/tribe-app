import { execFileSync } from "child_process";

let _gitPath: string | null = null;

/**
 * Resolve the absolute path to the git executable once and cache it.
 * Using an absolute path bypasses Node.js libuv's PATH traversal, which can
 * hit ELOOP when the inherited PATH contains entries with circular symlinks
 * (e.g. Claude Code session bin dirs).
 */
export function resolveGitBin(): string {
  if (_gitPath) return _gitPath;
  try {
    _gitPath = execFileSync("/usr/bin/which", ["git"], { encoding: "utf8" }).trim();
  } catch {
    _gitPath = "/usr/bin/git";
  }
  return _gitPath;
}
