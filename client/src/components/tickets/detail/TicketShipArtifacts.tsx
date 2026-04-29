import type { FormEventHandler } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { Ticket } from "../../../types";
import { TicketArtifactRows } from "./TicketArtifactRows";

type PullRequestArtifact = { repo: string; prUrl: string; commitSha: string };

export function TicketShipArtifacts({
  ticket,
  assignedArtifacts,
  shipPullRequests,
  feedbackOpen,
  feedbackBusy,
  feedbackDraft,
  feedbackError,
  canRequestFeedback,
  feedbackButtonTitle,
  feedbackCommentInput,
  onToggleFeedback,
  onCancelFeedback,
  onSubmitFeedback,
}: {
  ticket: Ticket;
  assignedArtifacts: boolean;
  shipPullRequests: PullRequestArtifact[];
  feedbackOpen: boolean;
  feedbackBusy: boolean;
  feedbackDraft: string;
  feedbackError: string | null;
  canRequestFeedback: boolean;
  feedbackButtonTitle: string;
  feedbackCommentInput: UseFormRegisterReturn<"comment">;
  onToggleFeedback: () => void;
  onCancelFeedback: () => void;
  onSubmitFeedback: FormEventHandler<HTMLFormElement>;
}) {
  if (!assignedArtifacts && !ticket.isDone) return null;

  return (
    <div className="td-section">
      <div className="td-section-header">
        <div className="td-section-label">Ship artifacts</div>
        <button
          className="td-feedback-button"
          type="button"
          disabled={!canRequestFeedback || feedbackBusy}
          onClick={onToggleFeedback}
          title={feedbackButtonTitle}
        >
          {feedbackOpen ? "Cancel" : "Add feedback"}
        </button>
      </div>
      {assignedArtifacts ? (
        <div className="td-artifacts-card">
          <TicketArtifactRows branchName={ticket.branchName} pullRequests={shipPullRequests} />
        </div>
      ) : null}
      {feedbackOpen ? (
        <form className="td-feedback-form" onSubmit={onSubmitFeedback}>
          <textarea
            className="input textarea"
            rows={3}
            placeholder="Describe the follow-up change…"
            {...feedbackCommentInput}
          />
          {feedbackError ? <div className="ticket-edit-error">{feedbackError}</div> : null}
          <div className="td-feedback-form__actions">
            <button
              className="btn"
              type="button"
              disabled={feedbackBusy}
              onClick={onCancelFeedback}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={feedbackBusy || !feedbackDraft.trim() || !canRequestFeedback}
            >
              {feedbackBusy ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
