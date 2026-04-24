import { useEffect, useState } from "react";
import { fetchProjects, createProject, updateProject, deleteProject } from "./api";
import type { Project } from "./types";

type EditState = {
  name: string;
  mondayBoardIds: string;
  mondayDefaultPersonId: string;
  mondayDevPeople: string;
};

function toEditState(p: Project): EditState {
  return {
    name: p.name,
    mondayBoardIds: (p.mondayBoardIds ?? []).join(", "),
    mondayDefaultPersonId: p.mondayDefaultPersonId ?? "",
    mondayDevPeople: (p.mondayDevPeople ?? []).join(", "),
  };
}

function parseBoardIds(raw: string): number[] | null {
  const ids = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? ids : null;
}

function parsePeople(raw: string): string[] | null {
  const people = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return people.length > 0 ? people : null;
}

type Props = {
  onProjectsChanged?: () => void;
};

export function ProjectsPage({ onProjectsChanged }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newForm, setNewForm] = useState<EditState>({ name: "", mondayBoardIds: "", mondayDefaultPersonId: "", mondayDevPeople: "" });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Record<number, EditState>>({});

  const load = async () => {
    try {
      setError(null);
      setProjects(await fetchProjects());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
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
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };

  const startEdit = (p: Project) => {
    setEditing((prev) => ({ ...prev, [p.id]: toEditState(p) }));
  };

  const cancelEdit = (id: number) => {
    setEditing((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const saveEdit = async (id: number) => {
    const data = editing[id];
    if (!data) return;
    try {
      await updateProject(id, {
        name: data.name.trim(),
        mondayBoardIds: parseBoardIds(data.mondayBoardIds),
        mondayDefaultPersonId: data.mondayDefaultPersonId.trim() || null,
        mondayDevPeople: parsePeople(data.mondayDevPeople),
      });
      cancelEdit(id);
      await load();
      onProjectsChanged?.();
    } catch (e: any) { setError(e.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this project? It must have no tickets or slots.")) return;
    try {
      await deleteProject(id);
      await load();
      onProjectsChanged?.();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Projects</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Project"}
        </button>
      </div>

      {showForm && (
        <form className="new-ticket-form" onSubmit={handleCreate} style={{ marginBottom: 24 }}>
          <h2>New Project</h2>
          <input className="input" placeholder="Name (e.g. eWebinar)" value={newForm.name}
            onChange={(e) => setNewForm((p) => ({ ...p, name: e.target.value }))} required autoFocus />
          <input className="input" placeholder="Monday board IDs (comma-separated, e.g. 626076134)" value={newForm.mondayBoardIds}
            onChange={(e) => setNewForm((p) => ({ ...p, mondayBoardIds: e.target.value }))} />
          <input className="input" placeholder="Default person ID (e.g. 14689324)" value={newForm.mondayDefaultPersonId}
            onChange={(e) => setNewForm((p) => ({ ...p, mondayDefaultPersonId: e.target.value }))} />
          <input className="input" placeholder="Dev people (comma-separated names, e.g. Long Pham)" value={newForm.mondayDevPeople}
            onChange={(e) => setNewForm((p) => ({ ...p, mondayDevPeople: e.target.value }))} />
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create Project"}
          </button>
        </form>
      )}

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="empty">No projects yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {projects.map((project) => {
            const isEditing = !!editing[project.id];
            const ed = editing[project.id];
            return (
              <div key={project.id} className="ticket-card" style={{ padding: "16px 20px" }}>
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
                      <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => startEdit(project)}>Edit</button>
                    )}
                    <button className="btn-delete" onClick={() => handleDelete(project.id)} title="Delete">×</button>
                  </div>
                </div>

                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    <input className="input" value={ed.name} placeholder="Name"
                      onChange={(e) => setEditing((p) => ({ ...p, [project.id]: { ...p[project.id], name: e.target.value } }))} />
                    <input className="input" value={ed.mondayBoardIds} placeholder="Monday board IDs (comma-separated)"
                      onChange={(e) => setEditing((p) => ({ ...p, [project.id]: { ...p[project.id], mondayBoardIds: e.target.value } }))} />
                    <input className="input" value={ed.mondayDefaultPersonId} placeholder="Default person ID"
                      onChange={(e) => setEditing((p) => ({ ...p, [project.id]: { ...p[project.id], mondayDefaultPersonId: e.target.value } }))} />
                    <input className="input" value={ed.mondayDevPeople} placeholder="Dev people (comma-separated)"
                      onChange={(e) => setEditing((p) => ({ ...p, [project.id]: { ...p[project.id], mondayDevPeople: e.target.value } }))} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => saveEdit(project.id)}>Save</button>
                      <button className="btn" style={{ fontSize: 12 }} onClick={() => cancelEdit(project.id)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{project.name}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#94a3b8" }}>
                      <div>Boards: <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>
                        {project.mondayBoardIds?.join(", ") ?? "—"}
                      </span></div>
                      <div>Default person: <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>
                        {project.mondayDefaultPersonId ?? "—"}
                      </span></div>
                      <div>Dev people: <span style={{ fontFamily: "monospace", color: "#e2e8f0" }}>
                        {project.mondayDevPeople?.join(", ") ?? "—"}
                      </span></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
