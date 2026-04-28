import type { Project } from "../types";

type StoredProjectSelection =
  | { kind: "missing" }
  | { kind: "legacy-all" }
  | { kind: "id"; id: number }
  | { kind: "invalid" };

export type ProjectShortcutTarget = {
  key: string;
  projectId: number | null;
  label: string;
};

const MAX_PROJECT_SHORTCUTS = 9;

const PROJECT_SELECTION_STORAGE_KEY = "tribe.selectedProjectId";
const LEGACY_ALL_PROJECTS_STORAGE_VALUE = "all";

export const readStoredProjectSelection = (): StoredProjectSelection => {
  try {
    const raw = window.localStorage.getItem(PROJECT_SELECTION_STORAGE_KEY);
    if (raw == null) return { kind: "missing" };
    if (raw === LEGACY_ALL_PROJECTS_STORAGE_VALUE) return { kind: "legacy-all" };
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0) return { kind: "id", id };
  } catch {
    return { kind: "missing" };
  }
  return { kind: "invalid" };
};

export const writeStoredProjectSelection = (projectId: number | null) => {
  try {
    if (projectId == null) {
      window.localStorage.removeItem(PROJECT_SELECTION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(PROJECT_SELECTION_STORAGE_KEY, String(projectId));
  } catch {
    // non-fatal
  }
};

export const clearStoredProjectSelection = () => {
  try {
    window.localStorage.removeItem(PROJECT_SELECTION_STORAGE_KEY);
  } catch {
    // non-fatal
  }
};

export const getProjectShortcutTargets = (projects: Project[]): ProjectShortcutTarget[] => {
  const projectTargets = projects.slice(0, MAX_PROJECT_SHORTCUTS - 1).map((project, index) => ({
    key: String(index + 2),
    projectId: project.id,
    label: project.name,
  }));

  return [{ key: "1", projectId: null, label: "All projects" }, ...projectTargets];
};

export const getProjectShortcutTargetByKey = (projects: Project[], key: string): ProjectShortcutTarget | null => {
  return getProjectShortcutTargets(projects).find((target) => target.key === key) ?? null;
};
