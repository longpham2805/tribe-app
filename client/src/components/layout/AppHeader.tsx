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

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="mono" style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 18, height: 18, padding: "0 5px",
      background: "var(--paper)", border: "1px solid var(--hairline-strong)",
      borderRadius: 4, fontSize: 10.5, fontWeight: 600, color: "var(--ink-3)",
    }}>{children}</span>
  );
}

interface AppHeaderProps {
  onSearchClick: () => void;
}

export const AppHeader = memo(function AppHeader({ onSearchClick }: AppHeaderProps) {
  const { view, setView, appState, setAutoTriggerEnabled, setCliAvailable } = useAppContext();
  const viewButtons = useMemo(() => VIEWS, []);

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          {/* Logo disc */}
          <span style={{
            width: 24, height: 24, borderRadius: 999, display: "inline-flex",
            alignItems: "center", justifyContent: "center",
            background: "var(--claude)", color: "var(--cream)",
            fontFamily: '"Source Serif 4", serif', fontWeight: 600, fontStyle: "italic",
            fontSize: 15, lineHeight: 0, letterSpacing: "-0.02em",
            flexShrink: 0,
          }}>t</span>
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

        {/* Search pill */}
        <button
          className="header-search"
          onClick={onSearchClick}
          type="button"
          aria-label="Search (⌘K)"
        >
          <SearchIcon />
          <span className="header-search__text">Search tickets, projects, actions…</span>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </button>

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
