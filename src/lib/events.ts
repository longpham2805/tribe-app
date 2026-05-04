import type { TribeEvent } from "../shared/events";

export type { TribeEvent };

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
