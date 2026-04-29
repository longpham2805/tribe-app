import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMondayItemPreview, fetchMondayNotStarted, importMondayItem, uploadTicketImage } from "../../api";
import type { CliType, MondayNotStartedItem, Project } from "../../types";
import { MondayBrowseStep } from "./monday/MondayBrowseStep";
import { MondayConfigureStep } from "./monday/MondayConfigureStep";
import { formatRelativeTime, getBoardLabel, previewImageToFile } from "./monday/mondayImportUtils";

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
  }, [onStepChange, projectId]);

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

  if (step === "configure") {
    return (
      <MondayConfigureStep
        error={error}
        selectedItem={selectedItem}
        title={title}
        description={description}
        pendingImages={pendingImages}
        configProjectId={configProjectId}
        agentMode={agentMode}
        projects={projects}
        availableCliTypes={availableCliTypes}
        projectLocked={projectId != null}
        loadingPreview={loadingPreview}
        importing={importing}
        onBack={handleBack}
        onClose={onClose}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onImagesChange={setPendingImages}
        onProjectIdChange={setConfigProjectId}
        onAgentModeChange={setAgentMode}
        onImport={() => void handleImport()}
      />
    );
  }

  return (
    <MondayBrowseStep
      loadingItems={loadingItems}
      error={error}
      items={items}
      filteredItems={filteredItems}
      groupedItems={groupedItems}
      focusedIndex={focusedIndex}
      selectedItem={selectedItem}
      search={search}
      boardLabel={boardLabel}
      syncedAt={syncedAt}
      syncLabel={syncLabel}
      onSearchChange={(value) => {
        setSearch(value);
        setFocusedIndex(0);
      }}
      onFocusIndexChange={setFocusedIndex}
      onSelectItem={setSelectedItem}
      onLoad={() => void load()}
      onClose={onClose}
      onContinue={(item) => void handleContinue(item)}
    />
  );
}
