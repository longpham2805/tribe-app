import { memo, useCallback, useEffect, useState } from "react";
import { createSlot, deleteSlot, fetchSlots, updateSlot } from "../api";
import type { Slot } from "../types";

type SlotsPageProps = {
  projectId: number | null;
};

type EditingMap = Record<number, { name: string; rootPath: string }>;

const SlotCard = memo(function SlotCard({
  slot,
  editData,
  onStartEdit,
  onCancelEdit,
  onDelete,
  onChangeEdit,
  onSave,
}: {
  slot: Slot;
  editData?: { name: string; rootPath: string };
  onStartEdit: (slot: Slot) => void;
  onCancelEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onChangeEdit: (id: number, field: "name" | "rootPath", value: string) => void;
  onSave: (id: number) => void;
}) {
  const isEditing = !!editData;
  const isFree = slot.currentTicketId === null;

  return (
    <div className="ticket-card" style={{ padding: "16px 20px" }}>
      <div className="ticket-header">
        <div className="ticket-meta">
          <span className="ticket-id">#{slot.id}</span>
          <span
            className="phase-badge"
            style={{
              background: isFree ? "#10b98122" : "#f59e0b22",
              color: isFree ? "#10b981" : "#f59e0b",
            }}
          >
            {isFree ? "Free" : `Ticket #${slot.currentTicketId}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isEditing && (
            <button
              className="btn btn-primary"
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={() => onStartEdit(slot)}
            >
              Edit
            </button>
          )}
          <button className="btn-delete" onClick={() => onDelete(slot.id)} title="Delete">
            ×
          </button>
        </div>
      </div>

      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <input
            className="input"
            value={editData.name}
            placeholder="Name"
            onChange={(e) => onChangeEdit(slot.id, "name", e.target.value)}
          />
          <input
            className="input"
            value={editData.rootPath}
            placeholder="Root path"
            onChange={(e) => onChangeEdit(slot.id, "rootPath", e.target.value)}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => onSave(slot.id)}>
              Save
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => onCancelEdit(slot.id)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{slot.name}</div>
          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>{slot.rootPath}</div>
        </div>
      )}
    </div>
  );
});

export function SlotsPage({ projectId }: SlotsPageProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRootPath, setNewRootPath] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditingMap>({});

  const load = useCallback(async () => {
    try {
      setError(null);
      setSlots(await fetchSlots(projectId ?? undefined));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName.trim() || !newRootPath.trim()) return;
      setCreating(true);
      try {
        await createSlot({ name: newName.trim(), rootPath: newRootPath.trim(), projectId });
        setNewName("");
        setNewRootPath("");
        setShowForm(false);
        await load();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setCreating(false);
      }
    },
    [newName, newRootPath, projectId, load],
  );

  const startEdit = useCallback((slot: Slot) => {
    setEditing((prev) => ({
      ...prev,
      [slot.id]: { name: slot.name, rootPath: slot.rootPath },
    }));
  }, []);

  const cancelEdit = useCallback((id: number) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const changeEdit = useCallback((id: number, field: "name" | "rootPath", value: string) => {
    setEditing((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }, []);

  const saveEdit = useCallback(
    async (id: number) => {
      const data = editing[id];
      if (!data) return;
      try {
        await updateSlot(id, { name: data.name, rootPath: data.rootPath });
        cancelEdit(id);
        await load();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [editing, cancelEdit, load],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!confirm("Delete this slot?")) return;
      try {
        await deleteSlot(id);
        await load();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [load],
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Workspace Slots</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? "Cancel" : "+ New Slot"}
        </button>
      </div>

      {showForm && (
        <form className="new-ticket-form" onSubmit={handleCreate} style={{ marginBottom: 24 }}>
          <h2>New Slot</h2>
          <input
            className="input"
            placeholder="Name (e.g. Slot 1)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            autoFocus
          />
          <input
            className="input"
            placeholder="Root path (absolute, e.g. /workspaces/slot-1)"
            value={newRootPath}
            onChange={(e) => setNewRootPath(e.target.value)}
            required
          />
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create Slot"}
          </button>
        </form>
      )}

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading...</div>
      ) : slots.length === 0 ? (
        <div className="empty">No slots yet. Create your first workspace slot above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {slots.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              editData={editing[slot.id]}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onDelete={handleDelete}
              onChangeEdit={changeEdit}
              onSave={saveEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
