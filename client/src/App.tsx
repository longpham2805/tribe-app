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
  const { view, setView, projects, selectedProjectId, setSelectedProjectId, canImportFromMonday, loadProjects, setShortcutIntent, paletteContextActions } = useAppContext();
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
        canImportFromMonday={canImportFromMonday}
        contextActions={paletteContextActions}
        projects={projects}
      />
    </div>
  );
}
