import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createProject, deleteProject, fetchProjects, updateProject, uploadProjectLogo } from "../api";
import type { Project } from "../types";

type ProjectsPageProps = {
  onProjectsChanged?: () => void;
};

type EditState = {
  name: string;
  mondayBoardIds: string;
  mondayDefaultPersonId: string;
  mondayDevPeople: string;
  primaryColor: string;
  actionColor: string;
  introduction: string;
  rules: string;
  techStack: string;
};

type ProjectModalMode = "create" | "configure";

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const MAX_PROJECT_CONTEXT_FIELD_CHARS = 4000;

function parseBoardIds(raw: string): number[] | null {
  const ids = raw.split(",").map((v) => parseInt(v.trim(), 10)).filter((v) => Number.isInteger(v) && v > 0);
  return ids.length > 0 ? ids : null;
}

function parsePeople(raw: string): string[] | null {
  const people = raw.split(",").map((v) => v.trim()).filter(Boolean);
  return people.length > 0 ? people : null;
}

function normalizeHexColorInput(raw: string, fieldLabel: string): string | null {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return null;
  if (!HEX_COLOR_PATTERN.test(normalized)) throw new Error(`${fieldLabel} must be in #RRGGBB format`);
  return normalized;
}

function normalizeProjectContextInput(raw: string): string | null {
  const normalized = raw.trim();
  return normalized || null;
}

function toEditState(p: Project): EditState {
  return {
    name: p.name,
    mondayBoardIds: (p.mondayBoardIds ?? []).join(", "),
    mondayDefaultPersonId: p.mondayDefaultPersonId ?? "",
    mondayDevPeople: (p.mondayDevPeople ?? []).join(", "),
    primaryColor: p.primaryColor ?? "",
    actionColor: p.actionColor ?? "",
    introduction: p.introduction ?? "",
    rules: p.rules ?? "",
    techStack: p.techStack ?? "",
  };
}

function ColorSwatch({ hex }: { hex: string }) {
  if (!HEX_COLOR_PATTERN.test(hex)) return null;
  return (
    <span style={{
      display: "inline-block", width: 38, borderRadius: 8,
      border: "1px solid var(--hairline-strong)", background: hex, alignSelf: "stretch",
    }} />
  );
}

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

function PSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-3)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

const ProjectModal = memo(function ProjectModal({
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
  const [form, setForm] = useState<EditState>({
    name: "", mondayBoardIds: "", mondayDefaultPersonId: "", mondayDevPeople: "",
    primaryColor: "", actionColor: "", introduction: "", rules: "", techStack: "",
  });
  const [mondayOpen, setMondayOpen] = useState(true);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "configure" && project) {
      setForm(toEditState(project));
    } else {
      setForm({ name: "", mondayBoardIds: "", mondayDefaultPersonId: "", mondayDevPeople: "", primaryColor: "", actionColor: "", introduction: "", rules: "", techStack: "" });
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

  const setField = useCallback((field: keyof EditState, value: string) => {
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

          {/* Monday.com — collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setMondayOpen((o) => !o)}
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

export function ProjectsPage({ onProjectsChanged }: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; mode: ProjectModalMode; project: Project | null }>({
    open: false, mode: "create", project: null,
  });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setProjects(await fetchProjects());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const closeModal = useCallback(() => {
    setModal((m) => ({ ...m, open: false }));
    setModalError(null);
  }, []);

  const handleSave = useCallback(
    async (form: EditState) => {
      setSaving(true);
      setModalError(null);
      try {
        const primaryColor = normalizeHexColorInput(form.primaryColor, "Primary color");
        const actionColor = normalizeHexColorInput(form.actionColor, "Action color");
        const payload = {
          name: form.name.trim(),
          mondayBoardIds: parseBoardIds(form.mondayBoardIds),
          mondayDefaultPersonId: form.mondayDefaultPersonId.trim() || null,
          mondayDevPeople: parsePeople(form.mondayDevPeople),
          primaryColor,
          actionColor,
          introduction: normalizeProjectContextInput(form.introduction),
          rules: normalizeProjectContextInput(form.rules),
          techStack: normalizeProjectContextInput(form.techStack),
        };
        if (modal.mode === "configure" && modal.project) {
          await updateProject(modal.project.id, payload);
        } else {
          await createProject(payload);
        }
        closeModal();
        await load();
        onProjectsChanged?.();
      } catch (e: any) {
        setModalError(e.message);
      } finally {
        setSaving(false);
      }
    },
    [modal, load, closeModal, onProjectsChanged],
  );

  const handleDelete = useCallback(
    async (projectId: number) => {
      if (!confirm("Delete this project? It must have no tickets or slots.")) return;
      try {
        await deleteProject(projectId);
        await load();
        onProjectsChanged?.();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [load, onProjectsChanged],
  );

  return (
    <div className="page-content">
      <div className="page-heading">
        <div className="page-heading__left">
          <div className="page-heading__breadcrumb">Workspace · Projects</div>
          <h1 className="page-heading__title serif">Projects</h1>
          <p className="page-heading__sub">Configure repos, Monday boards, and per-project agent rules.</p>
        </div>
        <div className="page-heading__actions">
          <button
            className="btn btn-primary"
            onClick={() => setModal({ open: true, mode: "create", project: null })}
          >
            + Create project
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="empty">No projects yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {projects.map((p) => {
            const running = p.runningTicketCount ?? 0;
            return (
              <div key={p.id} className="project-list-row">
                <span className="project-list-row__icon serif">{p.name.charAt(0).toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="serif" style={{ margin: 0, fontSize: 17, color: "var(--ink)", fontWeight: 500 }}>{p.name}</h3>
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>/{p.slug ?? ""}</div>
                </div>
                {running > 0 && (
                  <span className="sc-tag" style={{ background: "color-mix(in srgb, var(--claude-deep) 12%, transparent)", color: "var(--claude-deep)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--claude)", animation: "tp-pulse 1.4s infinite" }} />
                    {running} running
                  </span>
                )}
                <button
                  className="btn"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px" }}
                  onClick={() => setModal({ open: true, mode: "configure", project: p })}
                >
                  <SettingsIcon /> Configure
                </button>
                <button className="btn-delete" onClick={() => handleDelete(p.id)} title="Delete project">×</button>
              </div>
            );
          })}
        </div>
      )}

      <ProjectModal
        open={modal.open}
        mode={modal.mode}
        project={modal.project}
        onClose={closeModal}
        onSave={handleSave}
        saving={saving}
        error={modalError}
      />
    </div>
  );
}
