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
          <img src="/tribe-logo.svg" className="logo" alt="Tribe" />
          <span className="serif header-brand-name">Tribe</span>
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
              <span className="state-toggle__dot" aria-hidden="true" />
              {appState.autoTriggerEnabled ? "Auto" : "Paused"}
            </button>
            <div className="cli-toggles" aria-label="Available CLIs">
              {CLI_TYPES.map((cliType) => {
                const isAvailable = appState.availableCliTypes.includes(cliType.key);

                return (
                  <button
                    key={cliType.key}
                    type="button"
                    className={`cli-toggle ${isAvailable ? "cli-toggle--selected" : ""}`}
                    aria-pressed={isAvailable}
                    aria-label={`${cliType.label} CLI ${isAvailable ? "available" : "unavailable"}`}
                    title={`${cliType.label} CLI ${isAvailable ? "available" : "unavailable"}`}
                    onClick={() => void setCliAvailable(cliType.key, !isAvailable).catch(console.error)}
                  >
                    <span className="cli-toggle__indicator" aria-hidden="true" />
                    <span>{cliType.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </header>
  );
});
