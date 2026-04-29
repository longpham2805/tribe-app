import { Modal } from "../../ui/Modal";
import { MarkdownViewer } from "../../markdown/MarkdownViewer";
import type { TicketPhase } from "../../../types";
import { fileToPhase } from "./ticketDetailUtils";

export function TicketFilePane({
  open,
  ticketId,
  fileName,
  title,
  paneWidth,
  liveLogs,
  onCloseFile,
}: {
  open: boolean;
  ticketId: number;
  fileName: string;
  title: string;
  paneWidth: number;
  liveLogs: Record<string, any[]>;
  onCloseFile: () => void;
}) {
  const phaseName: TicketPhase | null = fileToPhase(fileName);
  const live = phaseName ? liveLogs[`${ticketId}:${phaseName}`] ?? [] : [];

  return (
    <Modal open={open} onClose={onCloseFile} title={title} variant="right-pane" width={paneWidth} noHeader>
      <div className="td-file-shell">
        <div className="td-topbar td-topbar--file">
          <span className="mono td-topbar__id">#{ticketId}</span>
          <span className="td-topbar__dot" aria-hidden="true" />
          <span className="td-topbar__project">{fileName}</span>
          <span style={{ flex: 1 }} />
          <button className="btn-delete td-topbar__close" type="button" onClick={onCloseFile} title="Back to ticket" aria-label="Back to ticket">
            ×
          </button>
        </div>
        <div className="td-file-body">
          <MarkdownViewer ticketId={ticketId} fileName={fileName} phaseName={phaseName} liveEvents={live} onBack={onCloseFile} />
        </div>
      </div>
    </Modal>
  );
}
