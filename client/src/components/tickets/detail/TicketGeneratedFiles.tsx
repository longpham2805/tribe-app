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
    <section className="td-section td-generated-files-section">
      <div className="td-section-header">
        <div>
          <div className="td-section-label">Generated files</div>
          <div className="td-section-caption">{filesLoading ? "Loading work outputs" : `${files.length} file${files.length === 1 ? "" : "s"} ready to inspect`}</div>
        </div>
      </div>
      {filesLoading ? (
        <div className="td-section-empty">Loading files…</div>
      ) : (
        <div className="file-chips td-file-chips">
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
    </section>
  );
}
