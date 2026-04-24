import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchProjects } from "../api";
import type { Project } from "../types";
import {
  clearStoredProjectSelection,
  readStoredProjectSelection,
  writeStoredProjectSelection,
} from "../utils/projectSelection";

export type View = "tickets" | "slots" | "projects";

type AppContextValue = {
  view: View;
  setView: (view: View) => void;
  projects: Project[];
  selectedProjectId: number | null;
  setSelectedProjectId: (projectId: number | null) => void;
  canImportFromMonday: boolean;
  loadProjects: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("tickets");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectIdState] = useState<number | null>(null);

  const selectedProject = useMemo(
    () => (selectedProjectId != null ? projects.find((project) => project.id === selectedProjectId) ?? null : null),
    [projects, selectedProjectId],
  );

  const canImportFromMonday = !!selectedProject?.mondayBoardIds?.length;

  const setSelectedProjectId = useCallback((projectId: number | null) => {
    setSelectedProjectIdState(projectId);
    writeStoredProjectSelection(projectId);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const list = await fetchProjects();
      const storedSelection = readStoredProjectSelection();
      setProjects(list);

      if (list.length === 0) {
        setSelectedProjectIdState(null);
        if (storedSelection.kind === "invalid") clearStoredProjectSelection();
        return;
      }

      if (storedSelection.kind === "id") {
        const savedProject = list.find((project) => project.id === storedSelection.id);
        if (savedProject) {
          setSelectedProjectIdState(savedProject.id);
          return;
        }
        clearStoredProjectSelection();
      }

      if (storedSelection.kind === "all") {
        setSelectedProjectIdState(null);
        return;
      }

      if (storedSelection.kind === "invalid") {
        clearStoredProjectSelection();
      }

      setSelectedProjectIdState((currentProjectId) => {
        if (currentProjectId != null && list.some((project) => project.id === currentProjectId)) {
          return currentProjectId;
        }
        return list[0].id;
      });
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const value = useMemo<AppContextValue>(
    () => ({
      view,
      setView,
      projects,
      selectedProjectId,
      setSelectedProjectId,
      canImportFromMonday,
      loadProjects,
    }),
    [view, projects, selectedProjectId, setSelectedProjectId, canImportFromMonday, loadProjects],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used inside AppProvider");
  }
  return context;
}
