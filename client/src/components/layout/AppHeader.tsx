import { memo, useMemo } from "react";
import type { CliType } from "../../types";
import { useAppContext, type View } from "../../context/AppContext";

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "tickets", label: "Tickets" },
  { key: "slots", label: "Slots" },
  { key: "projects", label: "Projects" },
];

const CLI_TYPES: Array<{ key: CliType; label: string }> = [
  { key: "CLAUDE", label: "Claude" },
  { key: "CODEX", label: "Codex" },
];

export const AppHeader = memo(function AppHeader() {
  const { view, setView, appState, setAutoTriggerEnabled, setCliAvailable } = useAppContext();
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
        {appState && (
          <div className="header-controls" aria-label="App controls">
            <button
              className={`state-toggle ${appState.autoTriggerEnabled ? "state-toggle--on" : "state-toggle--paused"}`}
              type="button"
              onClick={() => void setAutoTriggerEnabled(!appState.autoTriggerEnabled).catch(console.error)}
              title="Toggle automatic phase triggering and queued ticket promotion"
            >
              {appState.autoTriggerEnabled ? "Auto" : "Paused"}
            </button>
            <div className="cli-toggles" aria-label="Available CLIs">
              {CLI_TYPES.map((cliType) => (
                <label key={cliType.key} className="cli-toggle">
                  <input
                    type="checkbox"
                    checked={appState.availableCliTypes.includes(cliType.key)}
                    onChange={(event) =>
                      void setCliAvailable(cliType.key, event.currentTarget.checked).catch(console.error)
                    }
                  />
                  <span>{cliType.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  );
});
