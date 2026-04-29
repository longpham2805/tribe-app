import type { TicketFile } from "../../../types";

export function TicketGeneratedFiles({
  files,
  filesLoading,
  onOpenFile,
}: {
  files: TicketFile[];
  filesLoading: boolean;
  onOpenFile: (fileName: string) => void;
}) {
  if (!filesLoading && files.length === 0) return null;

  return (
    <div className="td-section">
      <div className="td-section-label">Generated files</div>
      {filesLoading ? (
        <div style={{ fontSize: 11, color: "var(--ink-4)" }}>Loading files…</div>
      ) : (
        <div className="file-chips">
          {files.map((file) => (
            <button
              key={file.name}
              className="file-chip"
              type="button"
              onClick={() => onOpenFile(file.name)}
              title={`${file.size} bytes · ${new Date(file.mtime).toLocaleString()}`}
            >
              <span className="mono file-chip-icon" style={{ fontSize: 11, color: "var(--ink-4)" }}>{"{}"}</span>
              {file.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
