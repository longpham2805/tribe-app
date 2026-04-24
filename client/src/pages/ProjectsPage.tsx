import { memo, useCallback, useEffect, useState } from "react";
import { createProject, deleteProject, fetchProjects, updateProject } from "../api";
import type { Project } from "../types";

type EditState = {
  name: string;
  mondayBoardIds: string;
  mondayDefaultPersonId: string;
  mondayDevPeople: string;
};

type ProjectsPageProps = {
  onProjectsChanged?: () => void;
};

function toEditState(project: Project): EditState {
  return {
    name: project.name,
    mondayBoardIds: (project.mondayBoardIds ?? []).join(", "),
    mondayDefaultPersonId: project.mondayDefaultPersonId ?? "",
    mondayDevPeople: (project.mondayDevPeople ?? []).join(", "),
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

const ProjectCard = memo(function ProjectCard({
  project,
  editData,
  onStartEdit,
  onDelete,
  onCancelEdit,
  onChangeEdit,
  onSave,
}: {
  project: Project;
  editData?: EditState;
  onStartEdit: (project: Project) => void;
  onDelete: (projectId: number) => void;
  onCancelEdit: (projectId: number) => void;
  onChangeEdit: (projectId: number, field: keyof EditState, value: string) => void;
  onSave: (projectId: number) => void;
}) {
  const isEditing = !!editData;

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
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{project.name}</div>
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
        await createProject({
          name: newForm.name.trim(),
          mondayBoardIds: parseBoardIds(newForm.mondayBoardIds),
          mondayDefaultPersonId: newForm.mondayDefaultPersonId.trim() || null,
          mondayDevPeople: parsePeople(newForm.mondayDevPeople),
        });
        setNewForm({ name: "", mondayBoardIds: "", mondayDefaultPersonId: "", mondayDevPeople: "" });
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
        await updateProject(projectId, {
          name: data.name.trim(),
          mondayBoardIds: parseBoardIds(data.mondayBoardIds),
          mondayDefaultPersonId: data.mondayDefaultPersonId.trim() || null,
          mondayDevPeople: parsePeople(data.mondayDevPeople),
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
