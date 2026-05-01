import type { Project } from "../../types";

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export function ProjectList({
  projects,
  onConfigure,
  onDelete,
}: {
  projects: Project[];
  onConfigure: (project: Project) => void;
  onDelete: (projectId: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {projects.map((project) => {
        const running = project.runningTicketCount ?? 0;
        return (
          <div key={project.id} className="project-list-row">
            <span className="project-list-row__icon serif">{project.name.charAt(0).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="serif" style={{ margin: 0, fontSize: 17, color: "var(--ink)", fontWeight: 500 }}>{project.name}</h3>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-4)" }}>/{project.slug ?? ""}</div>
            </div>
            {project.fastTrack && (
              <span className="sc-tag" style={{ background: "color-mix(in srgb, var(--claude-deep) 10%, transparent)", color: "var(--claude-deep)" }}>
                Fast Track
              </span>
            )}
            {running > 0 && (
              <span className="sc-tag" style={{ background: "color-mix(in srgb, var(--claude-deep) 12%, transparent)", color: "var(--claude-deep)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--claude)", animation: "tp-pulse 1.4s infinite" }} />
                {running} running
              </span>
            )}
            <button
              className="btn"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px" }}
              onClick={() => onConfigure(project)}
            >
              <SettingsIcon /> Configure
            </button>
            <button className="btn-delete" onClick={() => onDelete(project.id)} title="Delete project">×</button>
          </div>
        );
      })}
    </div>
  );
}
