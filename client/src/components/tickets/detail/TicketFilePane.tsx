import { lazy, Suspense } from "react";
import { Modal } from "../../ui/Modal";
import type { TicketPhase } from "../../../types";
import { fileToPhase } from "./ticketDetailUtils";

const MarkdownViewer = lazy(() => import("../../markdown/MarkdownViewer").then((module) => ({ default: module.MarkdownViewer })));

export function TicketFilePane({
  open,
  ticketId,
  fileName,
  title,
  paneWidth,
  rightPaneOffset = "0px",
  liveLogs,
  onCloseFile,
}: {
  open: boolean;
  ticketId: number;
  fileName: string;
  title: string;
  paneWidth: number;
  rightPaneOffset?: string;
  liveLogs: Record<string, any[]>;
  onCloseFile: () => void;
}) {
  const phaseName: TicketPhase | null = fileToPhase(fileName);
  const live = phaseName ? liveLogs[`${ticketId}:${phaseName}`] ?? [] : [];

  return (
    <Modal open={open} onClose={onCloseFile} title={title} variant="right-pane" width={paneWidth} rightOffset={rightPaneOffset} noHeader>
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
          <Suspense fallback={<div className="empty">Loading file viewer...</div>}>
            <MarkdownViewer ticketId={ticketId} fileName={fileName} phaseName={phaseName} liveEvents={live} onBack={onCloseFile} />
          </Suspense>
        </div>
      </div>
    </Modal>
  );
}
