import { memo, useEffect, useState } from "react";
import type { Project } from "../../types";

interface ProjectPaneProps {
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (projectId: number | null) => void;
}

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const FALLBACK_BG = [
  "#5C7B8A", "#6F8E5E", "#B07634",
  "#D97757", "#8C7B6A", "#6B6657",
];

function isHexColor(v: string | null | undefined): v is string {
  return typeof v === "string" && HEX_COLOR_PATTERN.test(v);
}

function getProjectBg(project: Project): string {
  return isHexColor(project.primaryColor)
    ? project.primaryColor
    : FALLBACK_BG[(project.id - 1) % FALLBACK_BG.length];
}

function getInitial(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

export const ProjectPane = memo(function ProjectPane({
  projects,
  selectedProjectId,
  onSelectProject,
}: ProjectPaneProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", collapsed ? "56px" : "220px");
  }, [collapsed]);
  const totalRunning = projects.reduce((s, p) => s + (p.runningTicketCount ?? 0), 0);

  if (collapsed) {
    return (
      <aside className="project-sidebar project-sidebar--collapsed" aria-label="Projects">
        <button
          className="project-sidebar__collapse-btn"
          onClick={() => setCollapsed(false)}
          title="Expand projects"
          type="button"
          aria-label="Expand projects sidebar"
        >
          <ChevronRight />
        </button>

        <div className="project-sidebar__divider" />

        {/* All */}
        <button
          type="button"
          className={`project-icon-btn${selectedProjectId === null ? " project-icon-btn--active" : ""}`}
          onClick={() => onSelectProject(null)}
          title="All projects"
          aria-label={`All projects${totalRunning > 0 ? `, ${totalRunning} running` : ""}`}
        >
          <span style={{ fontSize: 11, fontWeight: 600 }}>All</span>
          {totalRunning > 0 && <span className="project-icon-btn__badge">{totalRunning}</span>}
        </button>

        {projects.map((p) => {
          const bg = getProjectBg(p);
          const count = p.runningTicketCount ?? 0;
          const active = selectedProjectId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`project-icon-btn${active ? " project-icon-btn--active" : ""}`}
              style={active ? undefined : { background: bg, color: "#FAF9F5" }}
              onClick={() => onSelectProject(p.id)}
              title={p.name}
              aria-label={`${p.name}${count > 0 ? `, ${count} running` : ""}`}
            >
              {p.logoPath
                ? <img src={`/api/uploads/projects/${p.id}/logo`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                : <span style={{ fontFamily: '"Source Serif 4", serif', fontWeight: 600, fontSize: 15 }}>{getInitial(p.name)}</span>
              }
              {count > 0 && <span className="project-icon-btn__badge">{count}</span>}
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="project-sidebar" aria-label="Projects">
      <div className="project-sidebar__head">
        <span className="project-sidebar__label">Projects</span>
        <button
          className="project-sidebar__collapse-btn"
          onClick={() => setCollapsed(true)}
          title="Collapse projects"
          type="button"
          aria-label="Collapse projects sidebar"
        >
          <ChevronLeft />
        </button>
      </div>

      <div className="project-sidebar__list">
        {/* All projects row */}
        <button
          type="button"
          className={`project-row${selectedProjectId === null ? " project-row--active" : ""}`}
          onClick={() => onSelectProject(null)}
        >
          <span className="project-row__icon project-row__icon--all">•</span>
          <span className="project-row__name">All projects</span>
          {totalRunning > 0 && (
            <span className="project-row__running">
              <span className="project-row__running-dot" />
              {totalRunning}
            </span>
          )}
        </button>

        {projects.map((p) => {
          const bg = getProjectBg(p);
          const count = p.runningTicketCount ?? 0;
          const active = selectedProjectId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`project-row${active ? " project-row--active" : ""}`}
              onClick={() => onSelectProject(p.id)}
            >
              <span
                className="project-row__icon"
                style={{ background: bg, color: "#FAF9F5" }}
              >
                {p.logoPath
                  ? <img src={`/api/uploads/projects/${p.id}/logo`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                  : getInitial(p.name)
                }
              </span>
              <span className={`project-row__name${active ? " project-row__name--active" : ""}`}>{p.name}</span>
              {count > 0 && (
                <span className="project-row__running">
                  <span className="project-row__running-dot" />
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button className="project-sidebar__new-btn" type="button">
        <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
        New project
      </button>

      <div className="project-sidebar__info">
        <div className="serif" style={{ fontSize: 14, color: "var(--ink-1)", lineHeight: 1.35, marginBottom: 6 }}>
          Auto-trigger is on
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45 }}>
          New tickets advance through phases automatically when slots free up.
        </div>
      </div>
    </aside>
  );
});

function ChevronLeft() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
