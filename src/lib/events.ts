export type TribeEvent =
  | { type: "phase.updated"; ticketId: number; phase: unknown }
  | { type: "phase.log"; ticketId: number; phaseName: string; event: unknown }
  | { type: "ticket.updated"; ticket: unknown }
  | { type: "ticket.deleted"; ticketId: number }
  | { type: "app-state.updated"; appState: unknown }
  | { type: "assistant.message.created"; message: unknown }
  | { type: "assistant.action.updated"; action: unknown };

type Listener = (event: TribeEvent) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit(event: TribeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error("[events] listener error:", err);
    }
  }
}
