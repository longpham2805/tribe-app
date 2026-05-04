import { appendFileSync, mkdirSync } from "fs";
import { TicketPhase } from "../../enum/TicketPhase";
import { emit } from "../../lib/events";
import { getLogDir, getLogFile } from "../../lib/paths";
import type { PhaseLogEvent, PhaseSystemEvent, PhaseSystemEventMetadata } from "../../shared/events";

export const phaseLog = (msg: string) => console.log(`[PhaseHandler] ${msg}`);

export type PhaseLogContext = {
  ticketId: number;
  uid: string | null;
  phaseName: TicketPhase;
};

export type { PhaseSystemEventMetadata };

function buildPhaseSystemEvent(
  logContext: PhaseLogContext,
  code: string,
  message: string,
  metadata?: PhaseSystemEventMetadata,
): PhaseSystemEvent {
  const detail = Object.fromEntries(
    Object.entries(metadata ?? {}).filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined),
  );

  return {
    type: "system",
    source: "PhaseHandler",
    code,
    message,
    at: new Date().toISOString(),
    ticketId: logContext.ticketId,
    phaseName: logContext.phaseName,
    ...(Object.keys(detail).length ? { detail } : {}),
  };
}

export function persistPhaseEvent(logContext: PhaseLogContext | undefined, evt: PhaseLogEvent): void {
  if (!logContext?.uid) return;
  try {
    const logDir = getLogDir(logContext.uid);
    mkdirSync(logDir, { recursive: true });
    const logFile = getLogFile(logContext.uid, logContext.phaseName);
    appendFileSync(logFile, JSON.stringify(evt) + "\n");
    emit({
      type: "phase.log",
      ticketId: logContext.ticketId,
      phaseName: logContext.phaseName,
      event: evt,
    });
  } catch (err) {
    console.error("[PhaseHandler] failed to persist log event:", err);
  }
}

export function persistPhaseSystemEvent(
  logContext: PhaseLogContext | undefined,
  code: string,
  message: string,
  metadata?: PhaseSystemEventMetadata,
): void {
  if (!logContext) return;
  persistPhaseEvent(logContext, buildPhaseSystemEvent(logContext, code, message, metadata));
}
