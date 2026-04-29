import { useCallback, useEffect, useState } from "react";
import { createSlot, deleteSlot, fetchSlots, updateSlot } from "../api";
import { SlotModal, type SlotModalMode } from "../components/slots/SlotModal";
import type { Slot } from "../types";

type SlotsPageProps = {
  projectId: number | null;
};

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export function SlotsPage({ projectId }: SlotsPageProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; mode: SlotModalMode; slot: Slot | null }>({
    open: false, mode: "create", slot: null,
  });
  const [saving, setSaving] = useState(false);

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

  const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false })), []);

  const handleSave = useCallback(
    async (data: { name: string; rootPath: string }) => {
      setSaving(true);
      try {
        if (modal.mode === "configure" && modal.slot) {
          await updateSlot(modal.slot.id, { name: data.name, rootPath: data.rootPath });
        } else {
          await createSlot({ name: data.name, rootPath: data.rootPath, projectId });
        }
        closeModal();
        await load();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    },
    [modal, projectId, load, closeModal],
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
    <div className="page-content">
      <div className="page-heading">
        <div className="page-heading__left">
          <div className="page-heading__breadcrumb">Workers · Slots</div>
          <h1 className="page-heading__title serif">Slots</h1>
          <p className="page-heading__sub">Worker slots map to local checkouts. Pause a slot to halt new work without killing the running phase.</p>
        </div>
        <div className="page-heading__actions">
          <button
            className="btn btn-primary"
            onClick={() => setModal({ open: true, mode: "create", slot: null })}
          >
            + Create slot
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : slots.length === 0 ? (
        <div className="empty">No slots yet. Create your first workspace slot.</div>
      ) : (
        <div className="slots-grid">
          {slots.map((slot) => {
            const isBusy = slot.currentTicketId != null;
            return (
              <div key={slot.id} className="slot-card">
                <div className="slot-card__header">
                  <span
                    className="slot-card__dot"
                    style={{
                      background: isBusy ? "var(--claude)" : "var(--ink-5)",
                      animation: isBusy ? "tp-pulse 1.4s ease-in-out infinite" : "none",
                    }}
                  />
                  <h3 className="serif slot-card__name">{slot.name}</h3>
                  <span className="slot-card__status" style={{ color: isBusy ? "var(--claude-deep)" : "var(--ink-4)" }}>
                    {isBusy ? "Busy" : "Idle"}
                  </span>
                </div>
                <div className="mono slot-card__path">{slot.rootPath}</div>
                <div className="slot-card__footer">
                  <span style={{ fontSize: 12.5, color: "var(--ink-3)", flex: 1 }}>
                    {isBusy ? `Working ticket #${slot.currentTicketId}` : "Available for the next ticket in queue."}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px" }}
                      onClick={() => setModal({ open: true, mode: "configure", slot })}
                    >
                      <SettingsIcon /> Configure
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDelete(slot.id)}
                      title="Delete slot"
                    >×</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SlotModal
        open={modal.open}
        mode={modal.mode}
        slot={modal.slot}
        onClose={closeModal}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
