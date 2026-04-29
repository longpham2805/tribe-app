import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  createFeedback,
  createTicket,
  deleteTicket,
  respondPhase,
  triggerPhase,
  updateTicket,
  uploadTicketImage,
} from "../../../api";
import { PAUSED_STATUSES } from "../../../constants/ticket";
import type { Ticket, TicketPhase } from "../../../types";
import { MAX_LIVE_LOG_EVENTS } from "../utils/ticketBoard";

export function useTicketMutations({
  projectId,
  tickets,
  selectedTicketId,
  selectedTicket,
  setSelectedTicketId,
  setViewer,
  setTickets,
  setLiveLogs,
  setError,
  load,
  onCreateSuccess,
}: {
  projectId: number | null;
  tickets: Ticket[];
  selectedTicketId: number | null;
  selectedTicket: Ticket | null;
  setSelectedTicketId: Dispatch<SetStateAction<number | null>>;
  setViewer: Dispatch<SetStateAction<{ fileName: string | null } | null>>;
  setTickets: Dispatch<SetStateAction<Ticket[]>>;
  setLiveLogs: Dispatch<SetStateAction<Record<string, any[]>>>;
  setError: Dispatch<SetStateAction<string | null>>;
  load: () => Promise<void>;
  onCreateSuccess: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [triggeringPhase, setTriggeringPhase] = useState<string | null>(null);
  const [responseDraft, setResponseDraft] = useState<Record<number, string>>({});
  const [respondingTicket, setRespondingTicket] = useState<number | null>(null);
  const [creatingFeedbackTicket, setCreatingFeedbackTicket] = useState<number | null>(null);
  const [savingTicketContent, setSavingTicketContent] = useState<number | null>(null);

  const handleCreate = useCallback(
    async ({ title, description, cliType }: { title: string; description: string; cliType: "" | "CLAUDE" | "CODEX" }, files: File[]) => {
      if (!title.trim()) return;
      setCreating(true);
      try {
        const ticket = await createTicket({
          title: title.trim(),
          description: description.trim() || undefined,
          projectId,
          cliType: cliType || undefined,
        });
        const imageErrors: string[] = [];
        for (const file of files) {
          try {
            await uploadTicketImage(ticket.id, file);
          } catch {
            imageErrors.push(file.name);
          }
        }
        onCreateSuccess();
        await load();
        if (imageErrors.length > 0) {
          setError(`Ticket #${ticket.id} created. Failed to upload: ${imageErrors.join(", ")}. Retry via the ticket detail.`);
        }
      } catch (error: any) {
        setError(error.message);
      } finally {
        setCreating(false);
      }
    },
    [projectId, load, onCreateSuccess, setError],
  );

  const handleTriggerPhase = useCallback(
    async (ticketId: number, phase: TicketPhase) => {
      const key = `${ticketId}:${phase}`;
      setTriggeringPhase(key);
      try {
        await triggerPhase(ticketId, phase);
        await load();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setTriggeringPhase(null);
      }
    },
    [load, setError],
  );

  const handleDelete = useCallback(
    async (ticketId: number) => {
      if (!confirm("Remove this ticket?")) return;
      try {
        await deleteTicket(ticketId);
        if (selectedTicketId === ticketId) {
          setSelectedTicketId(null);
          setViewer(null);
        }
        await load();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [load, selectedTicketId, setError, setSelectedTicketId, setViewer],
  );

  const handleUpdateTicketContent = useCallback(
    async (ticketId: number, patch: { title: string; description: string }) => {
      setSavingTicketContent(ticketId);
      setError(null);
      try {
        const updated = await updateTicket(ticketId, patch);
        setTickets((prev) => prev.map((ticket) => (ticket.id === updated.id ? { ...ticket, ...updated } : ticket)));
        await load();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update ticket";
        setError(message);
        await load();
        throw new Error(message);
      } finally {
        setSavingTicketContent(null);
      }
    },
    [load, setError, setTickets],
  );

  const handleRespond = useCallback(
    async (ticketId: number) => {
      const message = (responseDraft[ticketId] ?? "").trim();
      if (!message) return;

      const ticket = tickets.find((item) => item.id === ticketId);
      const pausedPhase = ticket?.phases.find(
        (phase) => !!phase.startedAt && !phase.completedAt && PAUSED_STATUSES.includes(phase.status),
      );
      if (pausedPhase) {
        const key = `${ticketId}:${pausedPhase.phaseName}`;
        setLiveLogs((prev) => ({
          ...prev,
          [key]: [...(prev[key] ?? []), { type: "user_message", text: message }].slice(-MAX_LIVE_LOG_EVENTS),
        }));
      }

      setRespondingTicket(ticketId);
      try {
        await respondPhase(ticketId, message);
        setResponseDraft((prev) => {
          const next = { ...prev };
          delete next[ticketId];
          return next;
        });
        await load();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setRespondingTicket(null);
      }
    },
    [responseDraft, tickets, load, setError, setLiveLogs],
  );

  const handleCreateFeedback = useCallback(
    async (ticketId: number, comment: string) => {
      setCreatingFeedbackTicket(ticketId);
      setError(null);
      try {
        const updated = await createFeedback(ticketId, comment);
        setTickets((prev) => prev.map((ticket) => (ticket.id === updated.id ? { ...ticket, ...updated } : ticket)));
        await load();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create feedback";
        setError(message);
        await load();
        throw new Error(message);
      } finally {
        setCreatingFeedbackTicket(null);
      }
    },
    [load, setError, setTickets],
  );

  const handleResponseDraftChange = useCallback((value: string) => {
    if (!selectedTicket) return;
    setResponseDraft((prev) => ({ ...prev, [selectedTicket.id]: value }));
  }, [selectedTicket]);

  return {
    creating,
    triggeringPhase,
    responseDraft,
    respondingTicket,
    creatingFeedbackTicket,
    savingTicketContent,
    handleCreate,
    handleTriggerPhase,
    handleDelete,
    handleUpdateTicketContent,
    handleRespond,
    handleCreateFeedback,
    handleResponseDraftChange,
  };
}
