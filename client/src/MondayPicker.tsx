import { useEffect, useState } from "react";
import { fetchMondayNotStarted, importMondayItem } from "./api";
import type { MondayNotStartedItem } from "./types";

type Props = {
  onImported: () => Promise<void> | void;
};

function formatLabel(item: MondayNotStartedItem): string {
  const group = item.group?.title ?? "Ungrouped";
  return `[${group}] - MON-${item.id} - ${item.name}`;
}

export function MondayPicker({ onImported }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MondayNotStartedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchMondayNotStarted();
      setItems(next);
    } catch (err: any) {
      setError(err.message ?? "Failed to load Monday items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleImport = async (itemId: string) => {
    setImportingId(itemId);
    setError(null);
    try {
      await importMondayItem(itemId);
      await onImported();
      await load();
    } catch (err: any) {
      setError(err.message ?? "Import failed");
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="ticket-card" style={{ marginBottom: 16 }}>
      <div className="ticket-header">
        <h3 className="ticket-title" style={{ margin: 0 }}>
          Monday Not Started
        </h3>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading Monday items…</div>
      ) : items.length === 0 ? (
        <div className="empty">No not-started Monday items found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => {
            const busy = importingId === item.id;
            return (
              <button
                key={item.id}
                className="btn"
                style={{ textAlign: "left" }}
                onClick={() => void handleImport(item.id)}
                disabled={!!importingId}
                title={formatLabel(item)}
              >
                {busy ? "Importing…" : formatLabel(item)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
