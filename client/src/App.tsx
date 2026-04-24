import { AppHeader } from "./components/layout/AppHeader";
import { ProjectPane } from "./components/layout/ProjectPane";
import { useAppContext } from "./context/AppContext";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SlotsPage } from "./pages/SlotsPage";
import { TicketsPage } from "./pages/TicketsPage";
import "./App.css";

export default function App() {
  const { view, projects, selectedProjectId, setSelectedProjectId, canImportFromMonday, loadProjects } = useAppContext();

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
    </div>
  );
}
