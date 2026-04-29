import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTicketFiles } from "../../../api";
import type { TicketFile } from "../../../types";

export function useTicketFiles(selectedTicketId: number | null) {
  const [filesByTicket, setFilesByTicket] = useState<Record<number, TicketFile[]>>({});
  const ticketFileRefreshTimers = useRef<Record<number, number>>({});

  const fetchAndStoreTicketFiles = useCallback(async (ticketId: number) => {
    const files = await fetchTicketFiles(ticketId);
    setFilesByTicket((cur) => ({ ...cur, [ticketId]: files }));
  }, []);

  const scheduleTicketFilesRefresh = useCallback(
    (ticketId: number) => {
      if (selectedTicketId !== ticketId) return;
      const existing = ticketFileRefreshTimers.current[ticketId];
      if (existing) window.clearTimeout(existing);

      ticketFileRefreshTimers.current[ticketId] = window.setTimeout(() => {
        void fetchAndStoreTicketFiles(ticketId)
          .catch(() => {
            // ignore refresh errors
          })
          .finally(() => {
            delete ticketFileRefreshTimers.current[ticketId];
          });
      }, 2000);
    },
    [fetchAndStoreTicketFiles, selectedTicketId],
  );

  useEffect(() => {
    return () => {
      Object.values(ticketFileRefreshTimers.current).forEach((timerId) => window.clearTimeout(timerId));
      ticketFileRefreshTimers.current = {};
    };
  }, []);

  useEffect(() => {
    if (selectedTicketId == null) return;
    void fetchAndStoreTicketFiles(selectedTicketId).catch(() => {
      setFilesByTicket((cur) => (selectedTicketId in cur ? cur : { ...cur, [selectedTicketId]: [] }));
    });
  }, [fetchAndStoreTicketFiles, selectedTicketId]);

  return {
    filesByTicket,
    fetchAndStoreTicketFiles,
    scheduleTicketFilesRefresh,
  };
}
