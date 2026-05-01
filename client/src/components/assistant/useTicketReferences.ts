import { useEffect, useMemo, useRef, useState } from "react";
import { fetchTicket } from "../../api";
import type { AssistantMessage } from "../../types/assistant";
import type { Ticket } from "../../types";
import { extractTicketMentionIds } from "./ticketMentions";

type TicketReferenceState = {
  ticketsById: Map<number, Ticket>;
  missingIds: Set<number>;
};

export function useTicketReferences(messages: AssistantMessage[]) {
  const [state, setState] = useState<TicketReferenceState>(() => ({
    ticketsById: new Map<number, Ticket>(),
    missingIds: new Set<number>(),
  }));
  const loadingIds = useRef(new Set<number>());

  const referencedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const message of messages) {
      if (message.role === "user") continue;
      for (const id of extractTicketMentionIds(message)) ids.add(id);
    }
    return Array.from(ids);
  }, [messages]);

  useEffect(() => {
    const missingFetchIds = referencedIds.filter(
      (id) => !state.ticketsById.has(id) && !state.missingIds.has(id) && !loadingIds.current.has(id),
    );
    if (missingFetchIds.length === 0) return;

    let cancelled = false;
    for (const id of missingFetchIds) loadingIds.current.add(id);

    void Promise.all(
      missingFetchIds.map(async (id) => {
        try {
          const ticket = await fetchTicket(id);
          return { id, ticket };
        } catch (error) {
          console.error(`Failed to resolve assistant ticket reference #${id}`, error);
          return { id, ticket: null };
        }
      }),
    ).then((results) => {
      for (const { id } of results) loadingIds.current.delete(id);
      if (cancelled) return;

      setState((current) => {
        const ticketsById = new Map(current.ticketsById);
        const missingIds = new Set(current.missingIds);

        for (const { id, ticket } of results) {
          if (ticket) {
            ticketsById.set(id, ticket);
            missingIds.delete(id);
          } else {
            missingIds.add(id);
          }
        }

        return { ticketsById, missingIds };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [referencedIds, state.missingIds, state.ticketsById]);

  return state.ticketsById;
}
