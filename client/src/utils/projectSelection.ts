type StoredProjectSelection =
  | { kind: "missing" }
  | { kind: "all" }
  | { kind: "id"; id: number }
  | { kind: "invalid" };

const PROJECT_SELECTION_STORAGE_KEY = "tribe.selectedProjectId";
const ALL_PROJECTS_STORAGE_VALUE = "all";

export const readStoredProjectSelection = (): StoredProjectSelection => {
  try {
    const raw = window.localStorage.getItem(PROJECT_SELECTION_STORAGE_KEY);
    if (raw == null) return { kind: "missing" };
    if (raw === ALL_PROJECTS_STORAGE_VALUE) return { kind: "all" };
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
      window.localStorage.setItem(PROJECT_SELECTION_STORAGE_KEY, ALL_PROJECTS_STORAGE_VALUE);
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
