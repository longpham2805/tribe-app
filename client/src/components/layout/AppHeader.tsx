import { memo, useMemo } from "react";
import { useAppContext, type View } from "../../context/AppContext";

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "tickets", label: "Tickets" },
  { key: "slots", label: "Slots" },
  { key: "projects", label: "Projects" },
];

export const AppHeader = memo(function AppHeader() {
  const { projects, selectedProjectId, setSelectedProjectId, view, setView } = useAppContext();

  const shouldShowProjectPicker = projects.length > 1;
  const viewButtons = useMemo(() => VIEWS, []);

  return (
    <header className="header">
      <div className="header-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <h1 className="logo">Tribe</h1>
          {shouldShowProjectPicker && (
            <select
              value={selectedProjectId ?? ""}
              onChange={(e) => {
                const nextProjectId = e.target.value ? Number(e.target.value) : null;
                setSelectedProjectId(nextProjectId);
              }}
              style={{
                background: "#1e2a3a",
                color: "#e2e8f0",
                border: "1px solid #2d3e50",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
          <nav style={{ display: "flex", gap: 4 }}>
            {viewButtons.map((viewButton) => (
              <button
                key={viewButton.key}
                className={`tab ${view === viewButton.key ? "active" : ""}`}
                onClick={() => setView(viewButton.key)}
              >
                {viewButton.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
});
