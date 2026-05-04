import { useCallback, useEffect, useState } from "react";
import { createProject, deleteProject, fetchProjects, updateProject } from "../api";
import { ProjectList } from "../components/projects/ProjectList";
import { ProjectModal } from "../components/projects/ProjectModal";
import {
  normalizeHexColorInput,
  normalizeProjectContextInput,
  parseBoardIds,
  parsePeople,
  type EditState,
  type ProjectModalMode,
} from "../components/projects/projectForm";
import { useAppContext } from "../context/AppContext";
import type { Project } from "../types";

type ProjectsPageProps = {
  onProjectsChanged?: () => void;
};

export function ProjectsPage({ onProjectsChanged }: ProjectsPageProps) {
  const { shortcutIntent, clearShortcutIntent } = useAppContext();
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

  const openCreateModal = useCallback(() => {
    setModal({ open: true, mode: "create", project: null });
    setModalError(null);
  }, []);

  useEffect(() => {
    if (shortcutIntent?.type !== "new-project") return;

    openCreateModal();
    clearShortcutIntent();
  }, [clearShortcutIntent, openCreateModal, shortcutIntent]);

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
          fastTrack: form.fastTrack,
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
            onClick={openCreateModal}
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
        <ProjectList
          projects={projects}
          onConfigure={(project) => setModal({ open: true, mode: "configure", project })}
          onDelete={handleDelete}
        />
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
