import { lazy, Suspense, useEffect, useState, useCallback } from "react";
import { getProjectShortcutTargetByKey } from "./utils/projectSelection";
import { CommandPalette } from "./components/CommandPalette";
import { AppHeader } from "./components/layout/AppHeader";
import { ProjectPane } from "./components/layout/ProjectPane";
import { AssistantDrawer } from "./components/assistant/AssistantDrawer";
import { useAppContext } from "./context/AppContext";
import { useWebSocket } from "./ws";
import type { ShortcutIntent } from "./context/AppContext";
import type { AssistantMessage, AssistantAction } from "./types/assistant";
import "./App.css";

const TicketsPage = lazy(() => import("./pages/TicketsPage").then((module) => ({ default: module.TicketsPage })));
const SlotsPage = lazy(() => import("./pages/SlotsPage").then((module) => ({ default: module.SlotsPage })));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));

const ASSISTANT_PINNED_STORAGE_KEY = "tribe.assistant.pinned";

function readAssistantPinned() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ASSISTANT_PINNED_STORAGE_KEY) === "true";
}

export default function App() {
  const {
    view,
    setView,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    canImportFromMonday,
    loadProjects,
    setShortcutIntent,
    paletteContextActions,
  } = useAppContext();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [assistantPinned, setAssistantPinned] = useState(() => readAssistantPinned());
  const [assistantOpen, setAssistantOpen] = useState(() => readAssistantPinned());
  const [liveMessages, setLiveMessages] = useState<AssistantMessage[]>([]);
  const [liveActions, setLiveActions] = useState<AssistantAction[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    window.localStorage.setItem(ASSISTANT_PINNED_STORAGE_KEY, assistantPinned ? "true" : "false");
  }, [assistantPinned]);

  useWebSocket(useCallback((msg) => {
    if (msg.type === "assistant.message.created") {
      setLiveMessages((prev) => [...prev, msg.message]);
      if (!assistantOpen && msg.message.role !== "user") {
        setUnreadCount((n) => n + 1);
      }
    } else if (msg.type === "assistant.action.updated") {
      setLiveActions((prev) => {
        const map = new Map(prev.map((a) => [a.id, a]));
        map.set(msg.action.id, msg.action);
        return Array.from(map.values());
      });
    }
  }, [assistantOpen]));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAssistantOpen(false);
        return;
      }

      if (!e.metaKey && !e.ctrlKey) return;

      if (e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        setAssistantOpen((open) => !open);
        setUnreadCount(0);
        return;
      }

      const shortcutTarget = getProjectShortcutTargetByKey(projects, e.key);
      if (!shortcutTarget) return;

      e.preventDefault();
      setSelectedProjectId(shortcutTarget.projectId);
      setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [projects, setSelectedProjectId]);

  const handlePaletteAction = (intent: NonNullable<ShortcutIntent>) => {
    if (intent.type === "navigate") {
      setView(intent.view);
    } else if (intent.type === "switch-project") {
      setSelectedProjectId(intent.projectId);
    } else if (intent.type === "import-from-monday") {
      setView("tickets");
      setShortcutIntent(intent);
    } else {
      setShortcutIntent(intent);
    }
    setCommandPaletteOpen(false);
  };

  const handleAssistantPinnedChange = useCallback((pinned: boolean) => {
    setAssistantPinned(pinned);
    if (pinned) {
      setAssistantOpen(true);
      setUnreadCount(0);
    }
  }, []);

  return (
    <div className="app">
      <AppHeader onSearchClick={() => setCommandPaletteOpen(true)} />

      <div className="app-shell">
        <ProjectPane
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={(id) => setSelectedProjectId(id)}
        />

        <main className="main">
          <Suspense fallback={<div className="empty">Loading...</div>}>
            {view === "tickets" && <TicketsPage projectId={selectedProjectId} canImportFromMonday={canImportFromMonday} />}
            {view === "slots" && <SlotsPage projectId={selectedProjectId} />}
            {view === "projects" && <ProjectsPage onProjectsChanged={loadProjects} />}
          </Suspense>
        </main>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={handlePaletteAction}
        projectId={selectedProjectId}
        canImportFromMonday={canImportFromMonday}
        contextActions={paletteContextActions}
        projects={projects}
      />

      {!assistantOpen && (
        <button
          className="asst-fab"
          onClick={() => { setAssistantOpen(true); setUnreadCount(0); }}
          title="Open Assistant"
          aria-label="Open Assistant"
        >
          <span className="asst-fab__icon">t</span>
          <span className="asst-fab__label">Assistant</span>
          {unreadCount > 0 && (
            <span className="asst-fab__badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </button>
      )}

      <AssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        isPinned={assistantPinned}
        onPinnedChange={handleAssistantPinnedChange}
        newMessages={liveMessages}
        newActions={liveActions}
      />
    </div>
  );
}
