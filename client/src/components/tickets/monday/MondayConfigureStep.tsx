import type { CliType, MondayNotStartedItem, Project } from "../../../types";
import { ImageDropZone } from "../ImageDropZone";
import { PriorityChip } from "./MondayImportChips";
import { MondayDotsIcon } from "./MondayImportIcons";
import { MondayImportHeader } from "./MondayImportHeader";
import { getItemMeta } from "./mondayImportUtils";

export function MondayConfigureStep({
  error,
  selectedItem,
  title,
  description,
  pendingImages,
  configProjectId,
  agentMode,
  projects,
  availableCliTypes,
  projectLocked,
  loadingPreview,
  importing,
  onBack,
  onClose,
  onTitleChange,
  onDescriptionChange,
  onImagesChange,
  onProjectIdChange,
  onAgentModeChange,
  onImport,
}: {
  error: string | null;
  selectedItem: MondayNotStartedItem | null;
  title: string;
  description: string;
  pendingImages: File[];
  configProjectId: number | null;
  agentMode: CliType | "";
  projects: Project[];
  availableCliTypes: CliType[];
  projectLocked: boolean;
  loadingPreview: boolean;
  importing: boolean;
  onBack: () => void;
  onClose: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onImagesChange: (files: File[]) => void;
  onProjectIdChange: (value: number | null) => void;
  onAgentModeChange: (value: CliType | "") => void;
  onImport: () => void;
}) {
  const selectedMeta = selectedItem ? getItemMeta(selectedItem) : null;

  return (
    <div className="monday-import monday-import--configure">
      <MondayImportHeader step="configure" onBack={onBack} onClose={onClose} />

      <div className="monday-import__config-content">
        {error && <div className="error monday-import__error">{error}</div>}

        {selectedItem && (
          <div className="monday-import__source-card">
            <span className="monday-import__source-icon">
              <MondayDotsIcon />
            </span>
            <div className="monday-import__source-main">
              <div className="monday-import__source-meta">
                <span>From Monday</span>
                <span className="monday-import__item-id">MON-{selectedItem.id}</span>
                {selectedItem.group?.title && (
                  <>
                    <span className="monday-import__muted-dot">·</span>
                    <span>{selectedItem.group.title}</span>
                  </>
                )}
              </div>
              <div className="monday-import__source-title">{selectedItem.name}</div>
            </div>
            {selectedMeta?.priority && <PriorityChip label={selectedMeta.priority} />}
          </div>
        )}

        <div className="monday-import__form">
          <label className="ntm-field">
            <span className="ntm-field__label">Title</span>
            <input
              className="input monday-import__input"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              autoFocus={!loadingPreview}
            />
            {selectedItem && (
              <div className="monday-import__field-note monday-import__field-note--source">
                Monday: &ldquo;{selectedItem.name}&rdquo;
              </div>
            )}
            <div className="monday-import__field-note">Edit before importing — the original Monday title shows below.</div>
          </label>

          <label className="ntm-field">
            <span className="ntm-field__label">Description</span>
            {loadingPreview ? (
              <div className="input monday-import__textarea monday-import__loading">Loading from Monday…</div>
            ) : (
              <textarea
                className="input textarea monday-import__textarea"
                rows={5}
                placeholder="Add context or notes for the agent (optional)..."
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
              />
            )}
            <div className="monday-import__field-note">Pulled from the Monday item body. Edit freely or add Tribe-specific notes for the agent.</div>
          </label>

          <ImageDropZone files={pendingImages} onChange={onImagesChange} disabled={importing || loadingPreview} />

          <div className="monday-import__config-grid">
            <label className="ntm-field">
              <span className="ntm-field__label">Project</span>
              <select
                className="input monday-import__input"
                value={configProjectId ?? ""}
                onChange={(event) => onProjectIdChange(event.target.value ? Number(event.target.value) : null)}
                disabled={projectLocked}
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>

            <label className="ntm-field">
              <span className="ntm-field__label">Agent</span>
              <div className="monday-import__segments">
                {([
                  { key: "" as CliType | "", label: "Auto" },
                  { key: "CLAUDE" as CliType, label: "Claude" },
                  { key: "CODEX" as CliType, label: "Codex" },
                ] as const).map((option) => {
                  const isActive = agentMode === option.key;
                  const isDisabled = option.key !== "" && !availableCliTypes.includes(option.key);
                  return (
                    <button
                      key={option.key || "AUTO"}
                      type="button"
                      className={`monday-import__segment${isActive ? " monday-import__segment--active" : ""}`}
                      disabled={isDisabled || importing}
                      aria-pressed={isActive}
                      onClick={() => onAgentModeChange(option.key)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </label>
          </div>
        </div>
      </div>

      <footer className="monday-import__footer monday-import__footer--configure">
        <span className="monday-import__hint">
          <kbd>⌘</kbd>
          <kbd>↵</kbd>
          to import
        </span>
        <div className="monday-import__footer-actions">
          <button type="button" className="btn btn-secondary" onClick={onBack} disabled={importing}>
            Back
          </button>
          <button
            type="button"
            className="btn monday-import__import-button"
            onClick={onImport}
            disabled={importing || !title.trim()}
          >
            {importing ? "Importing…" : "+ Import to Tribe"}
          </button>
        </div>
      </footer>
    </div>
  );
}
