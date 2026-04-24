import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { fetchMondayNotStarted, importMondayItem } from "../../api";
import type { MondayNotStartedItem } from "../../types";

type MondayPickerProps = {
  onImported: () => Promise<void> | void;
  projectId?: number | null;
};

const MondayGroup = memo(function MondayGroup({
  title,
  items,
  selectedId,
  importingId,
  onSelect,
}: {
  title: string;
  items: MondayNotStartedItem[];
  selectedId: string | null;
  importingId: string | null;
  onSelect: (item: MondayNotStartedItem) => void;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.7rem",
          fontWeight: 600,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 6,
          paddingBottom: 4,
          borderBottom: "1px solid #1e2a3a",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => {
          const isSelected = selectedId === item.id;
          return (
            <button
              key={item.id}
              className="btn"
              style={{
                textAlign: "left",
                ...(isSelected ? { borderColor: "#3b82f6", color: "#3b82f6", background: "#3b82f611" } : {}),
              }}
              onClick={() => onSelect(item)}
              disabled={!!importingId}
              title={`MON-${item.id} - ${item.name}`}
            >
              {`MON-${item.id} - ${item.name}`}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export function MondayPicker({ onImported, projectId }: MondayPickerProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MondayNotStartedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MondayNotStartedItem | null>(null);
  const [clues, setClues] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchMondayNotStarted(projectId ?? undefined);
      setItems(next);
    } catch (err: any) {
      setError(err.message ?? "Failed to load Monday items");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedItems = useMemo(() => {
    const map = new Map<string, MondayNotStartedItem[]>();
    for (const item of items) {
      const groupTitle = item.group?.title ?? "Ungrouped";
      if (!map.has(groupTitle)) map.set(groupTitle, []);
      map.get(groupTitle)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const handleSelect = useCallback((item: MondayNotStartedItem) => {
    setSelectedItem(item);
    setClues("");
    setError(null);
  }, []);

  const handleImport = useCallback(async () => {
    if (!selectedItem) return;
    setImportingId(selectedItem.id);
    setError(null);
    try {
      await importMondayItem(selectedItem.id, clues, projectId);
      setSelectedItem(null);
      setClues("");
      await onImported();
      await load();
    } catch (err: any) {
      setError(err.message ?? "Import failed");
    } finally {
      setImportingId(null);
    }
  }, [selectedItem, clues, projectId, onImported, load]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading Monday items...</div>
      ) : items.length === 0 ? (
        <div className="empty">No not-started Monday items found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groupedItems.map(([groupTitle, groupItems]) => (
            <MondayGroup
              key={groupTitle}
              title={groupTitle}
              items={groupItems}
              selectedId={selectedItem?.id ?? null}
              importingId={importingId}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}

      {selectedItem && (
        <div style={{ marginTop: 16, borderTop: "1px solid #1e2a3a", paddingTop: 16 }}>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
            Importing <strong style={{ color: "#e2e8f0" }}>{selectedItem.name}</strong>
          </div>
          <textarea
            className="input textarea"
            rows={4}
            placeholder="Add any clues, context, or debugging notes for the agent (optional)..."
            value={clues}
            onChange={(e) => setClues(e.target.value)}
            autoFocus
            style={{ marginBottom: 10, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="btn"
              onClick={() => {
                setSelectedItem(null);
                setClues("");
              }}
              disabled={!!importingId}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void handleImport()} disabled={!!importingId}>
              {importingId ? "Importing..." : "Import"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
