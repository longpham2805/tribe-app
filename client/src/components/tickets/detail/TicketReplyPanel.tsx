import type { MutableRefObject } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { Phase, PhaseStatus, TicketPhase } from "../../../types";

export function TicketReplyPanel({
  paused,
  hasActivityDock,
  replyPanelRef,
  replyRegisterRef,
  replyTextareaRef,
  replyInput,
  replyMessage,
  responseDraft,
  isReplyBusy,
  phaseLabels,
  statusLabels,
  statusColors,
  onReplyChange,
  onDiscard,
  onRespond,
}: {
  paused: Phase | undefined;
  hasActivityDock: boolean;
  replyPanelRef: MutableRefObject<HTMLDivElement | null>;
  replyRegisterRef: UseFormRegisterReturn<"message">["ref"];
  replyTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  replyInput: Omit<UseFormRegisterReturn<"message">, "ref">;
  replyMessage: string;
  responseDraft: string;
  isReplyBusy: boolean;
  phaseLabels: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
  statusColors: Record<PhaseStatus, string | null>;
  onReplyChange: (value: string) => void;
  onDiscard: () => void;
  onRespond: () => void;
}) {
  if (!paused || paused.phaseName === "FEEDBACK") return null;

  return (
    <div
      ref={replyPanelRef}
      className={`td-paused-panel${hasActivityDock ? " td-paused-panel--sticky" : ""}`}
      style={{
        background: paused.status === "ERROR"
          ? "color-mix(in srgb, var(--status-error) 8%, var(--cream))"
          : "color-mix(in srgb, var(--status-warn) 9%, var(--cream))",
        borderColor: `color-mix(in srgb, ${statusColors[paused.status] ?? "var(--status-warn)"} 35%, transparent)`,
      }}
    >
      <div className="td-paused-panel__header">
        <div
          className="td-paused-panel__label"
          style={{ color: statusColors[paused.status] ?? "var(--status-warn)" }}
        >
          {phaseLabels[paused.phaseName]} — {statusLabels[paused.status]}
        </div>
        <div className="td-paused-panel__title">Reply to unblock this ticket</div>
      </div>
      {paused.lastMessage ? (
        <div className="serif td-paused-panel__message">{paused.lastMessage}</div>
      ) : null}
      <textarea
        ref={(node) => {
          replyRegisterRef(node);
          replyTextareaRef.current = node;
        }}
        className="input textarea td-paused-panel__textarea"
        rows={3}
        placeholder="Type the answer or fix details the agent needs…"
        {...replyInput}
        value={replyMessage}
        onChange={(event) => onReplyChange(event.target.value)}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onDiscard}
        >
          Discard
        </button>
        <button
          className="btn btn-primary"
          type="button"
          disabled={isReplyBusy || !responseDraft.trim()}
          onClick={onRespond}
        >
          {isReplyBusy ? "Sending…" : "Send reply to agent"}
        </button>
      </div>
    </div>
  );
}
