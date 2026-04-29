import type { FormEventHandler } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import type { Ticket, TicketPhase } from "../../../types";
import { SharedMarkdown } from "../../markdown/SharedMarkdown";
import { Tag } from "../../ui/Tag";
import { IconRobot } from "./TicketDetailIcons";
import { normalizeTicketDescriptionImages, relativeTime } from "./ticketDetailUtils";

export function TicketContentEditor({
  ticket,
  editingContent,
  assignedSlotName,
  phaseLabels,
  phaseColors,
  contentTitleInput,
  contentDescriptionInput,
  contentError,
  titleTooLong,
  savingContent,
  saveDisabled,
  onSubmit,
  onCancel,
}: {
  ticket: Ticket;
  editingContent: boolean;
  assignedSlotName: string | null;
  phaseLabels: Record<TicketPhase, string>;
  phaseColors: Record<TicketPhase, string>;
  contentTitleInput: UseFormRegisterReturn<"title">;
  contentDescriptionInput: UseFormRegisterReturn<"description">;
  contentError: string | null;
  titleTooLong: boolean;
  savingContent: boolean;
  saveDisabled: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
}) {
  return (
    <>
      {editingContent ? (
        <form className="ticket-edit-form" onSubmit={onSubmit}>
          <input
            className="input"
            maxLength={255}
            required
            autoFocus
            {...contentTitleInput}
          />
          <textarea
            className="input textarea"
            rows={4}
            {...contentDescriptionInput}
          />
          {contentError ? <div className="ticket-edit-error">{contentError}</div> : null}
          {titleTooLong ? <div className="ticket-edit-error">Title must be 255 characters or fewer.</div> : null}
          <div className="ticket-edit-actions">
            <button
              className="btn"
              type="button"
              disabled={savingContent}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={saveDisabled}>
              {savingContent ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <h1 className="serif td-title">{ticket.title}</h1>
      )}

      <div className="td-meta-row">
        <Tag color={phaseColors[ticket.currentPhase]} dot>
          {phaseLabels[ticket.currentPhase]}
        </Tag>
        <Tag color="var(--ink-2)" icon={<IconRobot />}>
          {ticket.cliType === "CODEX" ? "Codex" : "Claude"}
        </Tag>
        {ticket.waitingForSlot ? (
          <Tag color="var(--status-warn)">Waiting for slot</Tag>
        ) : assignedSlotName ? (
          <Tag color="var(--ink-3)">{assignedSlotName}</Tag>
        ) : null}
        <Tag color="var(--ink-4)">Created {relativeTime(ticket.createdAt)}</Tag>
      </div>

      {!editingContent && ticket.description ? (
        <div className="ticket-desc serif" style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-1)", marginBottom: 20 }}>
          <SharedMarkdown content={normalizeTicketDescriptionImages(ticket.description, ticket.id)} />
        </div>
      ) : null}
    </>
  );
}
