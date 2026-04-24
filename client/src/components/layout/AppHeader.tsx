import { memo, useMemo } from "react";
import { useAppContext, type View } from "../../context/AppContext";

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "tickets", label: "Tickets" },
  { key: "slots", label: "Slots" },
  { key: "projects", label: "Projects" },
];

export const AppHeader = memo(function AppHeader() {
  const { view, setView } = useAppContext();
  const viewButtons = useMemo(() => VIEWS, []);

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <h1 className="logo">Tribe</h1>
          <nav className="header-nav">
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
