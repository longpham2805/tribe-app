import { AppHeader } from "./components/layout/AppHeader";
import { useAppContext } from "./context/AppContext";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SlotsPage } from "./pages/SlotsPage";
import { TicketsPage } from "./pages/TicketsPage";
import "./App.css";

export default function App() {
  const { view, selectedProjectId, canImportFromMonday, loadProjects } = useAppContext();

  return (
    <div className="app">
      <AppHeader />

      <main className="main">
        {view === "tickets" && <TicketsPage projectId={selectedProjectId} canImportFromMonday={canImportFromMonday} />}
        {view === "slots" && <SlotsPage projectId={selectedProjectId} />}
        {view === "projects" && <ProjectsPage onProjectsChanged={loadProjects} />}
      </main>
    </div>
  );
}
