import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useWebSocket } from "../../../ws";
import type { Phase, Ticket, WsMessage } from "../../../types";
import { MAX_LIVE_LOG_EVENTS } from "../utils/ticketBoard";

export function useTicketLiveUpdates({
  projectId,
  setTickets,
  setLiveLogs,
  scheduleTicketFilesRefresh,
}: {
  projectId: number | null;
  setTickets: Dispatch<SetStateAction<Ticket[]>>;
  setLiveLogs: Dispatch<SetStateAction<Record<string, any[]>>>;
  scheduleTicketFilesRefresh: (ticketId: number) => void;
}) {
  useWebSocket(
    useCallback(
      (msg: WsMessage) => {
        if (msg.type === "phase.updated") {
          const updated = msg.phase as Phase;
          setTickets((prev) =>
            prev.map((ticket) =>
              ticket.id !== msg.ticketId
                ? ticket
                : {
                    ...ticket,
                    phases: ticket.phases.map((phase) => (phase.id === updated.id ? { ...phase, ...updated } : phase)),
                  },
            ),
          );
          scheduleTicketFilesRefresh(msg.ticketId);
          return;
        }

        if (msg.type === "ticket.updated") {
          const ticket = msg.ticket as Ticket;
          if (projectId != null && ticket.projectId != null && ticket.projectId !== projectId) return;
          setTickets((prev) => {
            const found = prev.some((x) => x.id === ticket.id);
            if (found) return prev.map((x) => (x.id === ticket.id ? { ...x, ...ticket } : x));
            return [ticket, ...prev];
          });
          return;
        }

        if (msg.type === "ticket.deleted") {
          setTickets((prev) => prev.filter((x) => x.id !== msg.ticketId));
          return;
        }

        if (msg.type === "phase.log") {
          const key = `${msg.ticketId}:${msg.phaseName}`;
          setLiveLogs((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), msg.event].slice(-MAX_LIVE_LOG_EVENTS) }));
          scheduleTicketFilesRefresh(msg.ticketId);
        }
      },
      [projectId, scheduleTicketFilesRefresh, setLiveLogs, setTickets],
    ),
  );
}
