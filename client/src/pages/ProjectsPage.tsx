import { memo, useCallback, useEffect, useRef, useState } from "react";
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

  return (
    <div className="ticket-card" style={{ padding: "16px 20px" }}>
      <div className="ticket-header">
        <div className="ticket-meta">
          <span className="ticket-id">#{project.id}</span>
          {project.slug && (
            <span className="phase-badge" style={{ background: "#3b82f622", color: "#3b82f6" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <input
            className="input"
            value={editData.name}
            placeholder="Name"
            onChange={(e) => onChangeEdit(project.id, "name", e.target.value)}
          />
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
          <input
            className="input"
            value={editData.primaryColor}
            placeholder="Primary color (#1D4ED8)"
            maxLength={7}
            onChange={(e) => onChangeEdit(project.id, "primaryColor", e.target.value)}
          />
          <input
            className="input"
            value={editData.actionColor}
            placeholder="Action color (#EFF6FF)"
            maxLength={7}
            onChange={(e) => onChangeEdit(project.id, "actionColor", e.target.value)}
          />
          <textarea
            className="input"
            value={editData.introduction}
            placeholder="Project introduction"
            maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
            rows={3}
            onChange={(e) => onChangeEdit(project.id, "introduction", e.target.value)}
          />
          <textarea
            className="input"
            value={editData.techStack}
            placeholder="Tech stack"
            maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
            rows={3}
            onChange={(e) => onChangeEdit(project.id, "techStack", e.target.value)}
          />
          <textarea
            className="input"
            value={editData.rules}
            placeholder="Project rules"
            maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
            rows={4}
            onChange={(e) => onChangeEdit(project.id, "rules", e.target.value)}
          />
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
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
            <div>
              Boards:{" "}
              <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>{project.mondayBoardIds?.join(", ") ?? "-"}</span>
            </div>
            <div>
              Default person:{" "}
              <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>{project.mondayDefaultPersonId ?? "-"}</span>
            </div>
            <div>
              Dev people:{" "}
              <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>{project.mondayDevPeople?.join(", ") ?? "-"}</span>
            </div>
            <div>
              Primary color:{" "}
              <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>{project.primaryColor ?? "-"}</span>
            </div>
            <div>
              Action color:{" "}
              <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>{project.actionColor ?? "-"}</span>
            </div>
            <div>
              Introduction:{" "}
              <span style={{ color: "#e2e8f0", whiteSpace: "pre-wrap" }}>{project.introduction ?? "-"}</span>
            </div>
            <div>
              Tech stack:{" "}
              <span style={{ color: "#e2e8f0", whiteSpace: "pre-wrap" }}>{project.techStack ?? "-"}</span>
            </div>
            <div>
              Project rules:{" "}
              <span style={{ color: "#e2e8f0", whiteSpace: "pre-wrap" }}>{project.rules ?? "-"}</span>
            </div>
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
            {logoError && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{logoError}</div>}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Projects</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? "Cancel" : "+ New Project"}
        </button>
      </div>

      {showForm && (
        <form className="new-ticket-form" onSubmit={handleCreate} style={{ marginBottom: 24 }}>
          <h2>New Project</h2>
          <input
            className="input"
            placeholder="Name (e.g. eWebinar)"
            value={newForm.name}
            onChange={(e) => setNewForm((prev) => ({ ...prev, name: e.target.value }))}
            required
            autoFocus
          />
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
          <input
            className="input"
            placeholder="Primary color (#1D4ED8)"
            value={newForm.primaryColor}
            maxLength={7}
            onChange={(e) => setNewForm((prev) => ({ ...prev, primaryColor: e.target.value }))}
          />
          <input
            className="input"
            placeholder="Action color (#EFF6FF)"
            value={newForm.actionColor}
            maxLength={7}
            onChange={(e) => setNewForm((prev) => ({ ...prev, actionColor: e.target.value }))}
          />
          <textarea
            className="input"
            placeholder="Project introduction"
            value={newForm.introduction}
            maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
            rows={3}
            onChange={(e) => setNewForm((prev) => ({ ...prev, introduction: e.target.value }))}
          />
          <textarea
            className="input"
            placeholder="Tech stack"
            value={newForm.techStack}
            maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
            rows={3}
            onChange={(e) => setNewForm((prev) => ({ ...prev, techStack: e.target.value }))}
          />
          <textarea
            className="input"
            placeholder="Project rules"
            value={newForm.rules}
            maxLength={MAX_PROJECT_CONTEXT_FIELD_CHARS}
            rows={4}
            onChange={(e) => setNewForm((prev) => ({ ...prev, rules: e.target.value }))}
          />
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
