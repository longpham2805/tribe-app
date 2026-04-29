import { useCallback, useEffect, useState } from "react";
import { fetchBoardTickets, fetchSlots } from "../../../api";
import type { Slot, Ticket } from "../../../types";
import { getTicketGroup, sortTicketsByNewest } from "../utils/ticketBoard";

export function useTicketBoardData(projectId: number | null) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreDone, setLoadingMoreDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [donePage, setDonePage] = useState(1);
  const [doneTotal, setDoneTotal] = useState(0);
  const [doneHasMore, setDoneHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [ticketData, slotData] = await Promise.all([
        fetchBoardTickets(projectId ?? undefined),
        fetchSlots(projectId ?? undefined),
      ]);
      setTickets([...ticketData.nonDoneTickets, ...ticketData.doneTickets]);
      setDonePage(ticketData.donePage);
      setDoneTotal(ticketData.doneTotal);
      setDoneHasMore(ticketData.doneHasMore);
      setTotalCount(ticketData.totalCount);
      setSlots(slotData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const loadMoreDone = useCallback(async () => {
    if (loadingMoreDone || !doneHasMore) return;

    setLoadingMoreDone(true);
    try {
      setError(null);
      const boardData = await fetchBoardTickets(projectId ?? undefined, donePage + 1);
      setTickets((prev) => {
        const loadedDoneTickets = prev.filter((ticket) => getTicketGroup(ticket) === "DONE");
        const doneTickets = sortTicketsByNewest([...loadedDoneTickets, ...boardData.doneTickets]).filter(
          (ticket, index, all) => all.findIndex((candidate) => candidate.id === ticket.id) === index,
        );
        return [...boardData.nonDoneTickets, ...doneTickets];
      });
      setDonePage(boardData.donePage);
      setDoneTotal(boardData.doneTotal);
      setDoneHasMore(boardData.doneHasMore);
      setTotalCount(boardData.totalCount);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMoreDone(false);
    }
  }, [doneHasMore, donePage, loadingMoreDone, projectId]);

  return {
    tickets,
    setTickets,
    slots,
    loading,
    loadingMoreDone,
    error,
    setError,
    doneTotal,
    doneHasMore,
    totalCount,
    load,
    loadMoreDone,
  };
}
