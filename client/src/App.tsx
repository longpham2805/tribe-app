import { useEffect, useState } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { AppHeader } from "./components/layout/AppHeader";
import { ProjectPane } from "./components/layout/ProjectPane";
import { useAppContext } from "./context/AppContext";
import type { ShortcutIntent } from "./context/AppContext";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SlotsPage } from "./pages/SlotsPage";
import { TicketsPage } from "./pages/TicketsPage";
import "./App.css";

export default function App() {
  const { view, projects, selectedProjectId, setSelectedProjectId, canImportFromMonday, loadProjects, setShortcutIntent } = useAppContext();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handlePaletteAction = (intent: NonNullable<ShortcutIntent>) => {
    setShortcutIntent(intent);
    setCommandPaletteOpen(false);
  };

  return (
    <div className="app">
      <AppHeader />

      <div className="app-shell">
        <ProjectPane
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
        />

        <main className="main">
          {view === "tickets" && <TicketsPage projectId={selectedProjectId} canImportFromMonday={canImportFromMonday} />}
          {view === "slots" && <SlotsPage projectId={selectedProjectId} />}
          {view === "projects" && <ProjectsPage onProjectsChanged={loadProjects} />}
        </main>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={handlePaletteAction}
        projectId={selectedProjectId}
      />
    </div>
  );
}
