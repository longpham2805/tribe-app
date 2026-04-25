import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchAppState, fetchProjects, updateAppState } from "../api";
import type { AppState, CliType, Project, WsMessage } from "../types";
import {
  clearStoredProjectSelection,
  readStoredProjectSelection,
  writeStoredProjectSelection,
} from "../utils/projectSelection";
import { useWebSocket } from "../ws";

export type View = "tickets" | "slots" | "projects";

export type ShortcutIntent =
  | { type: "new-ticket" }
  | { type: "open-ticket"; ticketId: number }
  | null;

type AppContextValue = {
  view: View;
  setView: (view: View) => void;
  projects: Project[];
  selectedProjectId: number | null;
  setSelectedProjectId: (projectId: number | null) => void;
  canImportFromMonday: boolean;
  appState: AppState | null;
  loadAppState: () => Promise<void>;
  setAutoTriggerEnabled: (enabled: boolean) => Promise<void>;
  setCliAvailable: (cliType: CliType, available: boolean) => Promise<void>;
  loadProjects: () => Promise<void>;
  shortcutIntent: ShortcutIntent;
  setShortcutIntent: (intent: ShortcutIntent) => void;
  clearShortcutIntent: () => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("tickets");
  const [projects, setProjects] = useState<Project[]>([]);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [selectedProjectId, setSelectedProjectIdState] = useState<number | null>(null);
  const [shortcutIntent, setShortcutIntent] = useState<ShortcutIntent>(null);
  const selectedProjectIdRef = useRef<number | null>(null);

  const selectedProject = useMemo(
    () => (selectedProjectId != null ? projects.find((project) => project.id === selectedProjectId) ?? null : null),
    [projects, selectedProjectId],
  );

  const canImportFromMonday = !!selectedProject?.mondayBoardIds?.length;

  const setSelectedProjectId = useCallback((projectId: number | null) => {
    selectedProjectIdRef.current = projectId;
    setSelectedProjectIdState(projectId);
    writeStoredProjectSelection(projectId);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const list = await fetchProjects();
      const storedSelection = readStoredProjectSelection();
      setProjects(list);

      if (list.length === 0) {
        selectedProjectIdRef.current = null;
        setSelectedProjectIdState(null);
        if (storedSelection.kind === "invalid") clearStoredProjectSelection();
        return;
      }

      if (storedSelection.kind === "id") {
        const savedProject = list.find((project) => project.id === storedSelection.id);
        if (savedProject) {
          selectedProjectIdRef.current = savedProject.id;
          setSelectedProjectIdState(savedProject.id);
          return;
        }
        clearStoredProjectSelection();
      }

      if (storedSelection.kind === "invalid") {
        clearStoredProjectSelection();
      }

      const currentProjectId = storedSelection.kind === "legacy-all" ? null : selectedProjectIdRef.current;
      const nextProjectId =
        currentProjectId != null && list.some((project) => project.id === currentProjectId)
          ? currentProjectId
          : list[0].id;

      selectedProjectIdRef.current = nextProjectId;
      setSelectedProjectIdState(nextProjectId);
      writeStoredProjectSelection(nextProjectId);
    } catch (error) {
      console.error("Failed to load projects", error);
    }
  }, []);

  const loadAppState = useCallback(async () => {
    try {
      setAppState(await fetchAppState());
    } catch (error) {
      console.error("Failed to load app state", error);
    }
  }, []);

  const setAutoTriggerEnabled = useCallback(async (enabled: boolean) => {
    const next = await updateAppState({ autoTriggerEnabled: enabled });
    setAppState(next);
  }, []);

  const setCliAvailable = useCallback(
    async (cliType: CliType, available: boolean) => {
      const current = appState?.availableCliTypes ?? [];
      const nextCliTypes = available
        ? [...new Set([...current, cliType])]
        : current.filter((value) => value !== cliType);
      const next = await updateAppState({ availableCliTypes: nextCliTypes });
      setAppState(next);
    },
    [appState],
  );

  const clearShortcutIntent = useCallback(() => setShortcutIntent(null), []);

  useEffect(() => {
    void loadProjects();
    void loadAppState();
  }, [loadProjects, loadAppState]);

  useWebSocket(
    useCallback((msg: WsMessage) => {
      if (msg.type === "app-state.updated") {
        setAppState(msg.appState);
      }
    }, []),
  );

  const value = useMemo<AppContextValue>(
    () => ({
      view,
      setView,
      projects,
      selectedProjectId,
      setSelectedProjectId,
      canImportFromMonday,
      appState,
      loadAppState,
      setAutoTriggerEnabled,
      setCliAvailable,
      loadProjects,
      shortcutIntent,
      setShortcutIntent,
      clearShortcutIntent,
    }),
    [
      view,
      projects,
      selectedProjectId,
      setSelectedProjectId,
      canImportFromMonday,
      appState,
      loadAppState,
      setAutoTriggerEnabled,
      setCliAvailable,
      loadProjects,
      shortcutIntent,
      clearShortcutIntent,
    ],
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
