import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMondayItemPreview, fetchMondayNotStarted, importMondayItem, uploadTicketImage } from "../../api";
import type { CliType, MondayNotStartedItem, MondayPreviewImage, Project } from "../../types";
import { ImageDropZone } from "./ImageDropZone";

type MondayPickerProps = {
  onImported: () => Promise<void> | void;
  onClose: () => void;
  projectId?: number | null;
  projects: Project[];
  availableCliTypes: CliType[];
  projectName?: string;
  step: "browse" | "configure";
  onStepChange: (step: "browse" | "configure") => void;
};

type PriorityKey = "critical" | "high" | "medium" | "low" | "neutral";

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "updated just now";
  if (mins < 60) return `updated ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `updated ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `updated ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `updated ${months}mo ago`;
  return `updated ${Math.floor(months / 12)}y ago`;
}

function formatAssignee(text: string | null | undefined): string {
  if (!text?.trim()) return "";
  return text
    .split(/\s*,\s*/)
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");
}

function timestampFromMondayText(text: string): string | undefined {
  const value = text.trim();
  if (!value) return undefined;
  const normalized = value.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC$/i, "$1T$2Z");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function getBoardLabel(projectName: string | undefined): string {
  const name = projectName?.trim();
  if (!name) return "Monday board";
  return /roadmap|board/i.test(name) ? name : `${name} board`;
}

function getPriorityKey(label: string): PriorityKey {
  const key = label.trim().toLowerCase();
  if (key === "critical" || key === "high" || key === "medium" || key === "low") return key;
  return "neutral";
}

function getItemMeta(item: MondayNotStartedItem) {
  const columnValues = item.column_values ?? [];
  const peopleText = columnValues.find((column) => column.id === "people")?.text ?? "";
  const priority =
    columnValues.find((column) => column.id === "priority" || column.id === "priority4")?.text?.trim() ?? "";
  const rawTags =
    columnValues.find((column) => column.id === "tags" || column.id === "label" || column.id === "labels")?.text ?? "";
  const tags = rawTags ? rawTags.split(",").map((tag) => tag.trim()).filter(Boolean) : [];
  const lastUpdatedText = columnValues.find((column) => column.id === "last_updated")?.text?.trim() ?? "";
  const updatedAtIso = item.updated_at || timestampFromMondayText(lastUpdatedText);

  return {
    people: formatAssignee(peopleText),
    priority,
    tags,
    updatedAt: formatRelativeTime(updatedAtIso),
  };
}

async function previewImageToFile(image: MondayPreviewImage): Promise<File> {
  const res = await fetch(image.dataUrl);
  const blob = await res.blob();
  return new File([blob], image.fileName, { type: image.mimeType || blob.type || "image/png" });
}

function PriorityChip({ label }: { label: string }) {
  const priorityKey = getPriorityKey(label);
  return (
    <span className={`monday-import-priority monday-import-priority--${priorityKey}`}>
      <span className="monday-import-priority__dot" />
      {label}
    </span>
  );
}

function TagChip({ text }: { text: string }) {
  return <span className="monday-import-tag">{text}</span>;
}

function MondayDotsIcon() {
  return (
    <span className="monday-import__dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function SearchIcon() {
  return (
    <svg className="monday-import__search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 7a6 6 0 1 0 6-6 6 6 0 0 0-4.24 1.76" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MondayImportHeader({
  step,
  onBack,
  onClose,
}: {
  step: "browse" | "configure";
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <header className={`monday-import__header monday-import__header--${step}`}>
      {step === "configure" ? (
        <button className="monday-import__icon-button" type="button" onClick={onBack} title="Back" aria-label="Back">
          <BackIcon />
        </button>
      ) : (
        <span className="monday-import__app-icon">
          <MondayDotsIcon />
        </span>
      )}

      <div className="monday-import__heading">
        {step === "configure" && <div className="monday-import__eyebrow">STEP 2 OF 2 · ADD CONTEXT</div>}
        <h2 className="monday-import__title">Import from Monday</h2>
        {step === "browse" && (
          <p className="monday-import__subtitle">Pick a ticket to pull into Tribe — you'll add Tribe-specific context next.</p>
        )}
      </div>

      <button className="monday-import__icon-button monday-import__close-button" type="button" onClick={onClose} title="Close" aria-label="Close">
        ×
      </button>
    </header>
  );
}

export function MondayPicker({
  onImported,
  onClose,
  projectId,
  projects,
  availableCliTypes,
  projectName,
  step,
  onStepChange,
}: MondayPickerProps) {
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [items, setItems] = useState<MondayNotStartedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedItem, setSelectedItem] = useState<MondayNotStartedItem | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [configProjectId, setConfigProjectId] = useState<number | null>(projectId ?? null);
  const [agentMode, setAgentMode] = useState<CliType | "">("");
  const [importing, setImporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const boardLabel = useMemo(() => getBoardLabel(projectName), [projectName]);

  useEffect(() => {
    setConfigProjectId(projectId ?? null);
  }, [projectId]);

  const load = useCallback(async () => {
    setLoadingItems(true);
    setError(null);
    try {
      const next = await fetchMondayNotStarted(projectId ?? undefined);
      setItems(next);
      setSyncedAt(new Date());
    } catch (err: any) {
      setError(err.message ?? "Failed to load Monday items");
    } finally {
      setLoadingItems(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const searchable = [
        item.id,
        item.name,
        item.group?.title ?? "",
        ...(item.column_values ?? []).map((column) => column.text ?? ""),
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }, [items, search]);

  useEffect(() => {
    setFocusedIndex((index) => Math.min(index, Math.max(filteredItems.length - 1, 0)));
  }, [filteredItems.length]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, MondayNotStartedItem[]>();
    for (const item of filteredItems) {
      const groupTitle = item.group?.title ?? "Ungrouped";
      if (!map.has(groupTitle)) map.set(groupTitle, []);
      map.get(groupTitle)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  const handleContinue = useCallback(async (item: MondayNotStartedItem) => {
    setSelectedItem(item);
    setTitle(item.name);
    setDescription("");
    setPendingImages([]);
    setError(null);
    setLoadingPreview(true);
    onStepChange("configure");
    try {
      const preview = await fetchMondayItemPreview(item.id, projectId ?? undefined);
      setDescription(preview.body);
      const imageResults = await Promise.allSettled((preview.images ?? []).map(previewImageToFile));
      setPendingImages(imageResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])));
    } catch {
      // The Monday title is enough to continue; extra context can be typed manually.
    } finally {
      setLoadingPreview(false);
    }
  }, [onStepChange]);

  const handleBack = useCallback(() => {
    onStepChange("browse");
    setError(null);
  }, [onStepChange]);

  const handleImport = useCallback(async () => {
    if (!selectedItem) return;
    setImporting(true);
    setError(null);
    try {
      const ticket = await importMondayItem(
        selectedItem.id,
        description,
        configProjectId,
        agentMode || undefined,
        title !== selectedItem.name ? title : undefined,
      );
      const imageErrors: string[] = [];
      for (const file of pendingImages) {
        try {
          await uploadTicketImage(ticket.id, file);
        } catch {
          imageErrors.push(file.name);
        }
      }
      await onImported();
      if (imageErrors.length > 0) {
        setError(`Ticket #${ticket.id} imported. Failed to upload: ${imageErrors.join(", ")}. Retry via the ticket detail.`);
        setImporting(false);
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Import failed");
      setImporting(false);
    }
  }, [agentMode, configProjectId, description, onClose, onImported, pendingImages, selectedItem, title]);

  useEffect(() => {
    if (step !== "browse") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button, select, textarea, a[href]")) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((index) => (filteredItems.length ? Math.min(index + 1, filteredItems.length - 1) : 0));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        const item = filteredItems[focusedIndex];
        if (!item) return;
        if (selectedItem?.id === item.id) {
          void handleContinue(item);
        } else {
          setSelectedItem(item);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filteredItems, focusedIndex, handleContinue, selectedItem, step]);

  useEffect(() => {
    if (step !== "configure") return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !importing) {
        event.preventDefault();
        void handleImport();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleImport, importing, step]);

  const syncLabel = syncedAt
    ? `synced ${formatRelativeTime(syncedAt.toISOString()).replace("updated ", "")}`
    : null;
  const hasBrowseRows = !loadingItems && filteredItems.length > 0;

  if (step === "configure") {
    const selectedMeta = selectedItem ? getItemMeta(selectedItem) : null;

    return (
      <div className="monday-import monday-import--configure">
        <MondayImportHeader step="configure" onBack={handleBack} onClose={onClose} />

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
                onChange={(event) => setTitle(event.target.value)}
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
                  onChange={(event) => setDescription(event.target.value)}
                />
              )}
              <div className="monday-import__field-note">Pulled from the Monday item body. Edit freely or add Tribe-specific notes for the agent.</div>
            </label>

            <ImageDropZone files={pendingImages} onChange={setPendingImages} disabled={importing || loadingPreview} />

            <div className="monday-import__config-grid">
              <label className="ntm-field">
                <span className="ntm-field__label">Project</span>
                <select
                  className="input monday-import__input"
                  value={configProjectId ?? ""}
                  onChange={(event) => setConfigProjectId(event.target.value ? Number(event.target.value) : null)}
                  disabled={projectId != null}
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
                        onClick={() => setAgentMode(option.key)}
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
            <button type="button" className="btn btn-secondary" onClick={handleBack} disabled={importing}>
              Back
            </button>
            <button
              type="button"
              className="btn monday-import__import-button"
              onClick={() => void handleImport()}
              disabled={importing || !title.trim()}
            >
              {importing ? "Importing…" : "+ Import to Tribe"}
            </button>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className={`monday-import monday-import--browse${hasBrowseRows ? " monday-import--browse-listing" : ""}`}>
      <MondayImportHeader step="browse" onClose={onClose} />

      <div className="monday-import__browse-top">
        <div className="monday-import__toolbar">
          <select className="monday-import__board-select" value={boardLabel} onChange={() => undefined} aria-label="Monday board">
            <option value={boardLabel}>{boardLabel}</option>
          </select>

          <div className="monday-import__search">
            <SearchIcon />
            <input
              ref={searchRef}
              className="input monday-import__search-input"
              placeholder="Search by ID, title, or label..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setFocusedIndex(0);
              }}
              autoFocus
            />
          </div>

          <button type="button" className="monday-import__refresh-button" disabled={loadingItems} onClick={() => void load()}>
            <RefreshIcon />
            {loadingItems ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {!loadingItems && !error && syncedAt && (
          <div className="monday-import__connection">
            <span className="monday-import__connection-dot" />
            <span>Connected</span>
            <span className="monday-import__muted-dot">·</span>
            <span>{boardLabel}</span>
            <span className="monday-import__muted-dot">·</span>
            <span>{items.length} tickets</span>
            <span className="monday-import__muted-dot">·</span>
            <span>{syncLabel}</span>
          </div>
        )}

        {error && <div className="error monday-import__error">{error}</div>}
      </div>

      <div className="monday-import__browse-list">
        {loadingItems ? (
          <div className="empty">Loading Monday items…</div>
        ) : filteredItems.length === 0 ? (
          <div className="empty">{items.length === 0 ? "No not-started Monday items found." : "No items match your search."}</div>
        ) : (
          <div className="monday-import__groups">
            {groupedItems.map(([groupTitle, groupItems]) => (
              <section className="monday-import__group" key={groupTitle}>
                <div className="monday-import__group-heading">
                  <span>{groupTitle}</span>
                  <span>{groupItems.length}</span>
                </div>

                <div className="monday-import__items">
                  {groupItems.map((item) => {
                    const flatIndex = filteredItems.indexOf(item);
                    const isFocused = flatIndex === focusedIndex;
                    const isSelected = selectedItem?.id === item.id;
                    const { people, priority, tags, updatedAt } = getItemMeta(item);
                    const hasMeta = Boolean(priority || tags.length || people || updatedAt);

                    return (
                      <div
                        key={item.id}
                        className={`monday-import__item${isFocused ? " monday-import__item--focused" : ""}${isSelected ? " monday-import__item--selected" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setFocusedIndex(flatIndex);
                          setSelectedItem(isSelected ? null : item);
                        }}
                        onDoubleClick={() => void handleContinue(item)}
                        onMouseEnter={() => setFocusedIndex(flatIndex)}
                      >
                        <span className="monday-import__radio" aria-hidden="true" />
                        <div className="monday-import__item-main">
                          <div className={`monday-import__item-title${hasMeta ? "" : " monday-import__item-title--solo"}`}>
                            <span className="monday-import__item-id">MON-{item.id}</span>
                            <span>{item.name}</span>
                          </div>

                          {hasMeta && (
                            <div className="monday-import__item-meta">
                              {priority && <PriorityChip label={priority} />}
                              {tags.map((tag) => <TagChip key={tag} text={tag} />)}
                              {(people || updatedAt) && (priority || tags.length > 0) && <span className="monday-import__muted-dot">·</span>}
                              {people && <span>{people}</span>}
                              {people && updatedAt && <span className="monday-import__muted-dot">·</span>}
                              {updatedAt && <span>{updatedAt}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <footer className="monday-import__footer monday-import__footer--browse">
        <div className="monday-import__selection">
          {selectedItem ? (
            <>
              <span className="monday-import__item-id">MON-{selectedItem.id}</span>
              <span>selected ·</span>
              <kbd>↵</kbd>
              <span>to continue</span>
            </>
          ) : (
            <span>Select a ticket to import</span>
          )}
        </div>

        <div className="monday-import__footer-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary monday-import__continue-button"
            onClick={() => {
              if (selectedItem) void handleContinue(selectedItem);
            }}
            disabled={!selectedItem}
          >
            <ArrowRightIcon />
            Continue
          </button>
        </div>
      </footer>
    </div>
  );
}
