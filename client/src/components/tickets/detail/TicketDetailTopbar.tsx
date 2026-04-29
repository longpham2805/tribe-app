import type { Ticket } from "../../../types";

export function TicketDetailTopbar({
  ticket,
  projectName,
  canEditContent,
  editingContent,
  savingContent,
  onToggleEdit,
  onDelete,
  onClose,
}: {
  ticket: Ticket;
  projectName: string | null;
  canEditContent: boolean;
  editingContent: boolean;
  savingContent: boolean;
  onToggleEdit: () => void;
  onDelete: (ticketId: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="td-topbar">
      <span className="mono td-topbar__id">#{ticket.id}</span>
      {projectName && (
        <>
          <span className="td-topbar__dot" aria-hidden="true" />
          <span className="td-topbar__project">{projectName}</span>
        </>
      )}
      <span style={{ flex: 1 }} />
      {canEditContent && (
        <button
          className="ticket-action-button"
          type="button"
          onClick={onToggleEdit}
          disabled={savingContent}
        >
          {editingContent ? "Cancel" : "Edit"}
        </button>
      )}
      <button
        className="ticket-remove-button"
        type="button"
        onClick={() => onDelete(ticket.id)}
        title="Remove ticket"
      >
        <svg
          className="ticket-remove-button__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M8 6V4.75C8 4.336 8.336 4 8.75 4h6.5c.414 0 .75.336.75.75V6" />
          <path d="M6.75 6l.6 11.3A2 2 0 0 0 9.347 19.2h5.306a2 2 0 0 0 1.997-1.9L17.25 6" />
          <path d="M10 10.25v5.5" />
          <path d="M14 10.25v5.5" />
        </svg>
        <span>Remove</span>
      </button>
      <button className="btn-delete td-topbar__close" type="button" onClick={onClose} title="Close" aria-label="Close">
        ×
      </button>
    </div>
  );
}
