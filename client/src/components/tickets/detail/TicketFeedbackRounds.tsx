import type { MutableRefObject } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { Phase, PhaseStatus, TicketPhase } from "../../../types";
import { Tag } from "../../ui/Tag";
import { TicketArtifactRows } from "./TicketArtifactRows";

export function TicketFeedbackRounds({
  feedbackPhases,
  paused,
  replyPanelRef,
  replyRegisterRef,
  replyTextareaRef,
  replyInput,
  replyMessage,
  isReplyBusy,
  phaseColors,
  statusLabels,
  statusColors,
  onReplyChange,
  onClearReply,
  onSubmitReply,
}: {
  feedbackPhases: Phase[];
  paused: Phase | undefined;
  replyPanelRef: MutableRefObject<HTMLDivElement | null>;
  replyRegisterRef: UseFormRegisterReturn<"message">["ref"];
  replyTextareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  replyInput: Omit<UseFormRegisterReturn<"message">, "ref">;
  replyMessage: string;
  isReplyBusy: boolean;
  phaseColors: Record<TicketPhase, string>;
  statusLabels: Record<PhaseStatus, string>;
  statusColors: Record<PhaseStatus, string | null>;
  onReplyChange: (value: string) => void;
  onClearReply: () => void;
  onSubmitReply: () => void;
}) {
  if (feedbackPhases.length === 0) return null;

  return (
    <section className="td-section td-feedback-section">
      <div className="td-section-header">
        <div>
          <div className="td-section-label">Feedback rounds</div>
          <div className="td-section-caption">{feedbackPhases.length} round{feedbackPhases.length === 1 ? "" : "s"} separated from ship artifacts.</div>
        </div>
      </div>
      <div className="td-feedback-list">
        {feedbackPhases.map((phase) => {
          const isActivePausedFeedback = paused?.id === phase.id;
          const color = statusColors[phase.status] ?? phaseColors.FEEDBACK;
          return (
            <div key={phase.id} className="td-feedback-card">
              <div className="td-feedback-card__head">
                <span className="td-feedback-card__title">Round {phase.sequence}</span>
                <Tag color={color} dot>{statusLabels[phase.status]}</Tag>
              </div>
              {phase.feedbackComment ? (
                <div className="td-feedback-card__comment serif">{phase.feedbackComment}</div>
              ) : null}
              <div className="td-artifacts-list td-artifacts-list--feedback">
                <TicketArtifactRows branchName={phase.branchName} pullRequests={phase.pullRequests} keyPrefix={`${phase.id}-`} />
              </div>
              {isActivePausedFeedback ? (
                <div ref={replyPanelRef} className="td-feedback-reply">
                  {phase.lastMessage ? (
                    <div className="serif td-paused-panel__message">{phase.lastMessage}</div>
                  ) : null}
                  <textarea
                    ref={(node) => {
                      replyRegisterRef(node);
                      replyTextareaRef.current = node;
                    }}
                    className="input textarea td-paused-panel__textarea"
                    rows={3}
                    placeholder="Reply to the feedback agent…"
                    {...replyInput}
                    value={replyMessage}
                    onChange={(event) => onReplyChange(event.target.value)}
                  />
                  <div className="td-reply-actions">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={onClearReply}
                    >
                      Discard
                    </button>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={isReplyBusy || !replyMessage.trim()}
                      onClick={onSubmitReply}
                    >
                      {isReplyBusy ? "Sending…" : "Send reply"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
