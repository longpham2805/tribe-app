import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createProject, deleteProject, fetchProjects, updateProject, uploadProjectLogo } from "../api";
import type { Project } from "../types";

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

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const MAX_PROJECT_CONTEXT_FIELD_CHARS = 4000;

type ProjectsPageProps = {
  onProjectsChanged?: () => void;
};

function toEditState(project: Project): EditState {
  return {
    name: project.name,
    mondayBoardIds: (project.mondayBoardIds ?? []).join(", "),
    mondayDefaultPersonId: project.mondayDefaultPersonId ?? "",
    mondayDevPeople: (project.mondayDevPeople ?? []).join(", "),
    primaryColor: project.primaryColor ?? "",
    actionColor: project.actionColor ?? "",
    introduction: project.introduction ?? "",
    rules: project.rules ?? "",
    techStack: project.techStack ?? "",
  };
}

function parseBoardIds(raw: string): number[] | null {
  const ids = raw
    .split(",")
    .map((value) => parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  return ids.length > 0 ? ids : null;
}

function parsePeople(raw: string): string[] | null {
  const people = raw.split(",").map((value) => value.trim()).filter(Boolean);
  return people.length > 0 ? people : null;
}

function normalizeHexColorInput(raw: string, fieldLabel: string): string | null {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return null;
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    throw new Error(`${fieldLabel} must be in #RRGGBB format`);
  }
  return normalized;
}

function normalizeProjectContextInput(raw: string): string | null {
  const normalized = raw.trim();
  return normalized || null;
}

function ColorSwatch({ hex }: { hex: string }) {
  if (!HEX_COLOR_PATTERN.test(hex)) return null;
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        borderRadius: 3,
        background: hex,
        border: "1px solid var(--hairline-strong)",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

const formSectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const formSectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--ink-3)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 2,
};

const ProjectCard = memo(function ProjectCard({
  project,
  editData,
  onStartEdit,
  onDelete,
  onCancelEdit,
  onChangeEdit,
  onSave,
  onLogoUploaded,
}: {
  project: Project;
  editData?: EditState;
  onStartEdit: (project: Project) => void;
  onDelete: (projectId: number) => void;
  onCancelEdit: (projectId: number) => void;
  onChangeEdit: (projectId: number, field: keyof EditState, value: string) => void;
  onSave: (projectId: number) => void;
  onLogoUploaded: (projectId: number) => void;
}) {
  const isEditing = !!editData;
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const handleLogoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoError(null);
    try {
      await uploadProjectLogo(project.id, file);
      onLogoUploaded(project.id);
    } catch (err: any) {
      setLogoError(err.message);
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }, [project.id, onLogoUploaded]);

  const hasMondayData =
    (project.mondayBoardIds?.length ?? 0) > 0 ||
    !!project.mondayDefaultPersonId ||
    (project.mondayDevPeople?.length ?? 0) > 0;

  return (
    <div className="ticket-card" style={{ padding: "16px 20px" }}>
      <div className="ticket-header">
        <div className="ticket-meta">
          <span className="ticket-id">#{project.id}</span>
          {project.slug && (
            <span className="phase-badge" style={{ background: "var(--claude)22", color: "var(--claude)" }}>
              {project.slug}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isEditing && (
            <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => onStartEdit(project)}>
              Edit
            </button>
          )}
          <button className="btn-delete" onClick={() => onDelete(project.id)} title="Delete">
            ×
          </button>
        </div>
      </div>

      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 10 }}>
          {/* Basic */}
          <div style={formSectionStyle}>
            <div style={formSectionLabelStyle}>Basic</div>
            <input
              className="input"
              value={editData.name}
              placeholder="Name"
              onChange={(e) => onChangeEdit(project.id, "name", e.target.value)}
            />
          </div>

          {/* Appearance */}
          <div style={formSectionStyle}>
            <div style={formSectionLabelStyle}>Appearance</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className="input"
                value={editData.primaryColor}
                placeholder="Primary color (#1D4ED8)"
                maxLength={7}
                onChange={(e) => onChangeEdit(project.id, "primaryColor", e.target.value)}
                style={{ flex: 1 }}
              />
              <ColorSwatch hex={editData.primaryColor} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className="input"
                value={editData.actionColor}
                placeholder="Action color (#EFF6FF)"
                maxLength={7}
                onChange={(e) => onChangeEdit(project.id, "actionColor", e.target.value)}
                style={{ flex: 1 }}
              />
              <ColorSwatch hex={editData.actionColor} />
            </div>
          </div>

          {/* Context */}
          <div style={formSectionStyle}>
            <div style={formSectionLabelStyle}>Context</div>
            <textarea
              className="input"
              value={editData.introduction}
              placeholder="Project introduction (markdown supported)"
              maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
              rows={3}
              onChange={(e) => onChangeEdit(project.id, "introduction", e.target.value)}
            />
            <textarea
              className="input"
              value={editData.techStack}
              placeholder="Tech stack (markdown supported)"
              maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
              rows={3}
              onChange={(e) => onChangeEdit(project.id, "techStack", e.target.value)}
            />
            <textarea
              className="input"
              value={editData.rules}
              placeholder="Project rules (markdown supported)"
              maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
              rows={4}
              onChange={(e) => onChangeEdit(project.id, "rules", e.target.value)}
            />
          </div>

          {/* Monday.com */}
          <details open={hasMondayData} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 12 }}>
            <summary style={{ ...formSectionLabelStyle, cursor: "pointer", userSelect: "none" }}>Monday.com</summary>
            <div style={{ ...formSectionStyle, marginTop: 8 }}>
              <input
                className="input"
                value={editData.mondayBoardIds}
                placeholder="Monday board IDs (comma-separated)"
                onChange={(e) => onChangeEdit(project.id, "mondayBoardIds", e.target.value)}
              />
              <input
                className="input"
                value={editData.mondayDefaultPersonId}
                placeholder="Default person ID"
                onChange={(e) => onChangeEdit(project.id, "mondayDefaultPersonId", e.target.value)}
              />
              <input
                className="input"
                value={editData.mondayDevPeople}
                placeholder="Dev people (comma-separated)"
                onChange={(e) => onChangeEdit(project.id, "mondayDevPeople", e.target.value)}
              />
            </div>
          </details>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => onSave(project.id)}>
              Save
            </button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => onCancelEdit(project.id)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            {project.logoPath && (
              <img
                src={`/api/uploads/projects/${project.id}/logo?v=${new Date(project.updatedAt).getTime()}`}
                alt={`${project.name} logo`}
                style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }}
              />
            )}
            <div style={{ fontWeight: 600 }}>{project.name}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--ink-4)" }}>
            {/* Colors */}
            {(project.primaryColor || project.actionColor) && (
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {project.primaryColor && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--ink-3)" }}>Primary:</span>
                    <ColorSwatch hex={project.primaryColor} />
                    <code style={{ color: "var(--ink)", fontSize: 11 }}>{project.primaryColor}</code>
                  </div>
                )}
                {project.actionColor && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--ink-3)" }}>Action:</span>
                    <ColorSwatch hex={project.actionColor} />
                    <code style={{ color: "var(--ink)", fontSize: 11 }}>{project.actionColor}</code>
                  </div>
                )}
              </div>
            )}

            {/* Monday.com — only shown when data exists */}
            {hasMondayData && (
              <details open style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", color: "var(--ink-3)", userSelect: "none", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Monday.com
                </summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                  {(project.mondayBoardIds?.length ?? 0) > 0 && (
                    <div>
                      Boards:{" "}
                      <span style={{ fontFamily: "monospace", color: "var(--ink)" }}>{project.mondayBoardIds!.join(", ")}</span>
                    </div>
                  )}
                  {project.mondayDefaultPersonId && (
                    <div>
                      Default person:{" "}
                      <span style={{ fontFamily: "monospace", color: "var(--ink)" }}>{project.mondayDefaultPersonId}</span>
                    </div>
                  )}
                  {(project.mondayDevPeople?.length ?? 0) > 0 && (
                    <div>
                      Dev people:{" "}
                      <span style={{ fontFamily: "monospace", color: "var(--ink)" }}>{project.mondayDevPeople!.join(", ")}</span>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Markdown text fields */}
            {project.introduction && (
              <div style={{ marginTop: 6 }}>
                <div style={{ color: "var(--ink-3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Introduction</div>
                <div className="project-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{project.introduction}</ReactMarkdown>
                </div>
              </div>
            )}
            {project.techStack && (
              <div style={{ marginTop: 6 }}>
                <div style={{ color: "var(--ink-3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Tech Stack</div>
                <div className="project-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{project.techStack}</ReactMarkdown>
                </div>
              </div>
            )}
            {project.rules && (
              <div style={{ marginTop: 6 }}>
                <div style={{ color: "var(--ink-3)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Rules</div>
                <div className="project-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{project.rules}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 8 }}>
            <input
              ref={logoInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp,.svg"
              style={{ display: "none" }}
              onChange={handleLogoChange}
            />
            <button
              className="btn"
              style={{ fontSize: 11, padding: "3px 8px" }}
              onClick={() => logoInputRef.current?.click()}
              disabled={logoUploading}
            >
              {logoUploading ? "Uploading..." : project.logoPath ? "Replace Logo" : "Upload Logo"}
            </button>
            {logoError && <div style={{ fontSize: 11, color: "var(--status-error)", marginTop: 4 }}>{logoError}</div>}
          </div>
        </div>
      )}
    </div>
  );
});

export function ProjectsPage({ onProjectsChanged }: ProjectsPageProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newForm, setNewForm] = useState<EditState>({
    name: "",
    mondayBoardIds: "",
    mondayDefaultPersonId: "",
    mondayDevPeople: "",
    primaryColor: "",
    actionColor: "",
    introduction: "",
    rules: "",
    techStack: "",
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Record<number, EditState>>({});

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

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newForm.name.trim()) return;
      setCreating(true);
      try {
        const primaryColor = normalizeHexColorInput(newForm.primaryColor, "Primary color");
        const actionColor = normalizeHexColorInput(newForm.actionColor, "Action color");
        await createProject({
          name: newForm.name.trim(),
          mondayBoardIds: parseBoardIds(newForm.mondayBoardIds),
          mondayDefaultPersonId: newForm.mondayDefaultPersonId.trim() || null,
          mondayDevPeople: parsePeople(newForm.mondayDevPeople),
          primaryColor,
          actionColor,
          introduction: normalizeProjectContextInput(newForm.introduction),
          rules: normalizeProjectContextInput(newForm.rules),
          techStack: normalizeProjectContextInput(newForm.techStack),
        });
        setNewForm({
          name: "",
          mondayBoardIds: "",
          mondayDefaultPersonId: "",
          mondayDevPeople: "",
          primaryColor: "",
          actionColor: "",
          introduction: "",
          rules: "",
          techStack: "",
        });
        setShowForm(false);
        await load();
        onProjectsChanged?.();
      } catch (e: any) {
        setError(e.message);
      } finally {
        setCreating(false);
      }
    },
    [newForm, load, onProjectsChanged],
  );

  const startEdit = useCallback((project: Project) => {
    setEditing((prev) => ({ ...prev, [project.id]: toEditState(project) }));
  }, []);

  const cancelEdit = useCallback((projectId: number) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[projectId];
      return next;
    });
  }, []);

  const changeEdit = useCallback((projectId: number, field: keyof EditState, value: string) => {
    setEditing((prev) => ({ ...prev, [projectId]: { ...prev[projectId], [field]: value } }));
  }, []);

  const saveEdit = useCallback(
    async (projectId: number) => {
      const data = editing[projectId];
      if (!data) return;
      try {
        const primaryColor = normalizeHexColorInput(data.primaryColor, "Primary color");
        const actionColor = normalizeHexColorInput(data.actionColor, "Action color");
        await updateProject(projectId, {
          name: data.name.trim(),
          mondayBoardIds: parseBoardIds(data.mondayBoardIds),
          mondayDefaultPersonId: data.mondayDefaultPersonId.trim() || null,
          mondayDevPeople: parsePeople(data.mondayDevPeople),
          primaryColor,
          actionColor,
          introduction: normalizeProjectContextInput(data.introduction),
          rules: normalizeProjectContextInput(data.rules),
          techStack: normalizeProjectContextInput(data.techStack),
        });
        cancelEdit(projectId);
        await load();
        onProjectsChanged?.();
      } catch (e: any) {
        setError(e.message);
      }
    },
    [editing, cancelEdit, load, onProjectsChanged],
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

  const handleLogoUploaded = useCallback(async (_projectId: number) => {
    await load();
  }, [load]);

  return (
    <div>
      <div className="page-heading">
        <div className="page-heading__left">
          <h1 className="page-heading__title serif">Projects</h1>
          <p className="page-heading__sub">Configure repos, Monday boards, and per-project agent rules.</p>
        </div>
        <div className="page-heading__actions">
          <button className="btn btn-primary" onClick={() => setShowForm((prev) => !prev)}>
            {showForm ? "Cancel" : "+ New Project"}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="new-ticket-form" onSubmit={handleCreate} style={{ marginBottom: 24 }}>
          <h2>New Project</h2>

          {/* Basic */}
          <div style={{ ...formSectionStyle, marginBottom: 12 }}>
            <div style={formSectionLabelStyle}>Basic</div>
            <input
              className="input"
              placeholder="Name (e.g. eWebinar)"
              value={newForm.name}
              onChange={(e) => setNewForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              autoFocus
            />
          </div>

          {/* Appearance */}
          <div style={{ ...formSectionStyle, marginBottom: 12 }}>
            <div style={formSectionLabelStyle}>Appearance</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className="input"
                placeholder="Primary color (#1D4ED8)"
                value={newForm.primaryColor}
                maxLength={7}
                onChange={(e) => setNewForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
                style={{ flex: 1 }}
              />
              <ColorSwatch hex={newForm.primaryColor} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className="input"
                placeholder="Action color (#EFF6FF)"
                value={newForm.actionColor}
                maxLength={7}
                onChange={(e) => setNewForm((prev) => ({ ...prev, actionColor: e.target.value }))}
                style={{ flex: 1 }}
              />
              <ColorSwatch hex={newForm.actionColor} />
            </div>
          </div>

          {/* Context */}
          <div style={{ ...formSectionStyle, marginBottom: 12 }}>
            <div style={formSectionLabelStyle}>Context</div>
            <textarea
              className="input"
              placeholder="Project introduction (markdown supported)"
              value={newForm.introduction}
              maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
              rows={3}
              onChange={(e) => setNewForm((prev) => ({ ...prev, introduction: e.target.value }))}
            />
            <textarea
              className="input"
              placeholder="Tech stack (markdown supported)"
              value={newForm.techStack}
              maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
              rows={3}
              onChange={(e) => setNewForm((prev) => ({ ...prev, techStack: e.target.value }))}
            />
            <textarea
              className="input"
              placeholder="Project rules (markdown supported)"
              value={newForm.rules}
              maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
              rows={4}
              onChange={(e) => setNewForm((prev) => ({ ...prev, rules: e.target.value }))}
            />
          </div>

          {/* Monday.com */}
          <details style={{ marginBottom: 12 }}>
            <summary style={{ ...formSectionLabelStyle, cursor: "pointer", userSelect: "none" }}>Monday.com</summary>
            <div style={{ ...formSectionStyle, marginTop: 8 }}>
              <input
                className="input"
                placeholder="Monday board IDs (comma-separated, e.g. 626076134)"
                value={newForm.mondayBoardIds}
                onChange={(e) => setNewForm((prev) => ({ ...prev, mondayBoardIds: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Default person ID (e.g. 14689324)"
                value={newForm.mondayDefaultPersonId}
                onChange={(e) => setNewForm((prev) => ({ ...prev, mondayDefaultPersonId: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Dev people (comma-separated names, e.g. Long Pham)"
                value={newForm.mondayDevPeople}
                onChange={(e) => setNewForm((prev) => ({ ...prev, mondayDevPeople: e.target.value }))}
              />
            </div>
          </details>

          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create Project"}
          </button>
        </form>
      )}

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="empty">No projects yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              editData={editing[project.id]}
              onStartEdit={startEdit}
              onDelete={handleDelete}
              onCancelEdit={cancelEdit}
              onChangeEdit={changeEdit}
              onSave={saveEdit}
              onLogoUploaded={handleLogoUploaded}
            />
          ))}
        </div>
      )}
    </div>
  );
}
