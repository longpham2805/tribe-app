import type { PhaseLogEvent, WebSocketMessage } from "../../../src/shared/events";

export type PhaseLogMap = Record<string, PhaseLogEvent[]>;
export type WsMessage = WebSocketMessage;
export type { PhaseLogEvent, WebSocketMessage };
