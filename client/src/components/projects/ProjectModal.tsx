import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { uploadProjectLogo } from "../../api";
import type { Project } from "../../types";
import {
  emptyEditState,
  HEX_COLOR_PATTERN,
  MAX_PROJECT_CONTEXT_FIELD_CHARS,
  toEditState,
  type EditState,
  type ProjectModalMode,
} from "./projectForm";

function ColorSwatch({ hex }: { hex: string }) {
  if (!HEX_COLOR_PATTERN.test(hex)) return null;
  return (
    <span style={{
      display: "inline-block", width: 38, borderRadius: 8,
      border: "1px solid var(--hairline-strong)", background: hex, alignSelf: "stretch",
    }} />
  );
}

function PSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

export const ProjectModal = memo(function ProjectModal({
  open,
  mode,
  project,
  onClose,
  onSave,
  saving,
  error,
}: {
  open: boolean;
  mode: ProjectModalMode;
  project: Project | null;
  onClose: () => void;
  onSave: (form: EditState) => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<EditState>(emptyEditState);
  const [mondayOpen, setMondayOpen] = useState(true);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "configure" && project) {
      setForm(toEditState(project));
    } else {
      setForm(emptyEditState());
    }
    setMondayOpen(true);
    setLogoError(null);
  }, [open, mode, project]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setField = useCallback((field: keyof EditState, value: EditState[keyof EditState]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleLogoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!project) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoError(null);
    try {
      await uploadProjectLogo(project.id, file);
    } catch (err: any) {
      setLogoError(err.message);
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }, [project]);

  if (!open) return null;
  const isConfigure = mode === "configure";
  const idLabel = isConfigure && project ? `#${project.id} · ${project.slug ?? ""}` : "New project";

  return (
    <div className="ntm-backdrop" onClick={onClose}>
      <div className="ntm-panel ntm-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="ntm-panel__topbar">
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-4)" }}>{idLabel}</span>
          {isConfigure && project && (
            <span className="mono" style={{ fontSize: 11.5, color: "var(--claude-deep)" }}>{project.name?.toLowerCase()}</span>
          )}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            style={{ width: 24, height: 24, border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", borderRadius: 6, display: "grid", placeItems: "center", fontSize: 16 }}
          >×</button>
        </div>

        <form
          className="ntm-panel__form ntm-panel__form--scroll"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return;
            onSave(form);
          }}
        >
          <PSection label="Basic">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Project name"
              autoFocus
              required
            />
          </PSection>

          <PSection label="Workflow">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "var(--ink)", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.fastTrack}
                onChange={(e) => setField("fastTrack", e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <span style={{ display: "block", fontWeight: 600 }}>Fast Track mode</span>
                <span style={{ display: "block", color: "var(--ink-4)", marginTop: 2 }}>Run this project through accelerated ticket flow.</span>
              </span>
            </label>
          </PSection>

          <PSection label="Appearance">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  className="input mono"
                  value={form.primaryColor}
                  onChange={(e) => setField("primaryColor", e.target.value)}
                  placeholder="Primary color (#1D4ED8)"
                  maxLength={7}
                  style={{ flex: 1 }}
                />
                <ColorSwatch hex={form.primaryColor} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  className="input mono"
                  value={form.actionColor}
                  onChange={(e) => setField("actionColor", e.target.value)}
                  placeholder="Action color (#EFF6FF)"
                  maxLength={7}
                  style={{ flex: 1 }}
                />
                <ColorSwatch hex={form.actionColor} />
              </div>
            </div>
          </PSection>

          <PSection label="Context">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                className="input"
                value={form.introduction}
                onChange={(e) => setField("introduction", e.target.value)}
                placeholder="Project introduction (markdown supported)"
                maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
                rows={2}
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
              <textarea
                className="input mono"
                value={form.techStack}
                onChange={(e) => setField("techStack", e.target.value)}
                placeholder={"### Frontend\n- **Framework**: …"}
                maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
                rows={4}
                style={{ resize: "vertical", fontSize: 12.5 }}
              />
              <textarea
                className="input"
                value={form.rules}
                onChange={(e) => setField("rules", e.target.value)}
                placeholder="Project rules (markdown supported)"
                maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
                rows={3}
                style={{ resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
          </PSection>

          {isConfigure && project && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 6 }}>Logo</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {project.logoPath && (
                  <img
                    src={`/api/uploads/projects/${project.id}/logo?v=${Date.now()}`}
                    alt={`${project.name} logo`}
                    style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", border: "1px solid var(--hairline-strong)" }}
                  />
                )}
                <input ref={logoInputRef} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.svg" style={{ display: "none" }} onChange={handleLogoChange} />
                <button type="button" className="btn" style={{ fontSize: 12, padding: "5px 10px" }} onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                  {logoUploading ? "Uploading…" : project.logoPath ? "Replace logo" : "Upload logo"}
                </button>
                {logoError && <span style={{ fontSize: 11, color: "var(--status-error)" }}>{logoError}</span>}
              </div>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setMondayOpen((open) => !open)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: 0, marginBottom: 8,
                background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase",
              }}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" style={{ transform: mondayOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 140ms" }}>
                <path d="M2 1L6 4.5L2 8" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Monday.com
            </button>
            {mondayOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  className="input mono"
                  value={form.mondayBoardIds}
                  onChange={(e) => setField("mondayBoardIds", e.target.value)}
                  placeholder="Board IDs (comma-separated, e.g. 626076134)"
                  style={{ fontSize: 12.5 }}
                />
                <input
                  className="input mono"
                  value={form.mondayDefaultPersonId}
                  onChange={(e) => setField("mondayDefaultPersonId", e.target.value)}
                  placeholder="Default person ID (e.g. 14689324)"
                  style={{ fontSize: 12.5 }}
                />
                <input
                  className="input"
                  value={form.mondayDevPeople}
                  onChange={(e) => setField("mondayDevPeople", e.target.value)}
                  placeholder="Dev people (comma-separated names)"
                />
              </div>
            )}
          </div>

          {error && <div className="error" style={{ marginTop: 0 }}>{error}</div>}

          <div className="ntm-panel__footer ntm-panel__footer--sticky">
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
              {isConfigure ? "Changes apply to all in-flight tickets." : "You can configure repos and rules after creating."}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={saving || !form.name.trim()}>
                {saving ? "Saving…" : isConfigure ? "Save" : "Create project"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
});
