import { memo, useEffect, useState } from "react";
import type { Slot } from "../../types";

export type SlotModalMode = "create" | "configure";

export const SlotModal = memo(function SlotModal({
  open,
  mode,
  slot,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  mode: SlotModalMode;
  slot: Slot | null;
  onClose: () => void;
  onSave: (data: { name: string; rootPath: string }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");

  useEffect(() => {
    if (!open) return;
    if (mode === "configure" && slot) {
      setName(slot.name);
      setRootPath(slot.rootPath);
    } else {
      setName("");
      setRootPath("");
    }
  }, [open, mode, slot]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const isConfigure = mode === "configure";

  return (
    <div className="ntm-backdrop" onClick={onClose}>
      <div className="ntm-panel ntm-panel--narrow" onClick={(e) => e.stopPropagation()}>
        <div className="ntm-panel__header">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
              {isConfigure && slot ? `#${slot.id} · ${slot.name}` : "New slot"}
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{ width: 24, height: 24, border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", borderRadius: 6, display: "grid", placeItems: "center", fontSize: 16 }}
            >×</button>
          </div>
          <h2 className="serif ntm-panel__title">{isConfigure ? "Configure slot" : "New slot"}</h2>
          <p className="ntm-panel__sub">A slot is a worker checkout. One ticket per slot at a time.</p>
        </div>
        <form
          className="ntm-panel__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !rootPath.trim()) return;
            onSave({ name: name.trim(), rootPath: rootPath.trim() });
          }}
        >
          <label className="ntm-field">
            <span className="ntm-field__label">Name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. macbook-1"
              autoFocus
              required
            />
          </label>
          <label className="ntm-field">
            <span className="ntm-field__label">Root path</span>
            <input
              className="input mono"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="absolute, e.g. ~/code/atlas-1"
              required
            />
          </label>
          <div className="ntm-panel__footer">
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
              {isConfigure ? "Slot pauses while saving." : "Tribe will probe the path before activating."}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || !name.trim() || !rootPath.trim()}
              >
                {saving ? "Saving…" : isConfigure ? "Save" : "Create slot"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
});
