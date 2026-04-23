import { homedir } from "os";
import { join } from "path";

export function getTicketDir(uid: string): string {
  return join(homedir(), ".tribe", uid);
}

export function getLogDir(uid: string): string {
  return join(getTicketDir(uid), "logs");
}

export function getLogFile(uid: string, phaseName: string): string {
  return join(getLogDir(uid), `${phaseName.toLowerCase()}.jsonl`);
}

export function getStderrFile(uid: string, phaseName: string): string {
  return join(getLogDir(uid), `${phaseName.toLowerCase()}.stderr.log`);
}
