import { memo, type CSSProperties } from "react";
import type { Project } from "../../types";

interface ProjectPaneProps {
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (projectId: number) => void;
}

export const ProjectPane = memo(function ProjectPane({
  projects,
  selectedProjectId,
  onSelectProject,
}: ProjectPaneProps) {
  const items = projects.map((project) => ({
    id: project.id,
    name: project.name,
    slug: project.slug,
    running: !!project.hasRunningTickets,
    runningCount: project.runningTicketCount ?? 0,
  }));

  return (
    <aside className="project-pane" aria-label="Projects">
      <div className="project-pane-list">
        {items.map((item) => {
          const isActive = selectedProjectId === item.id;
          const className = [
            "ticket-card",
            "project-pane-card",
            isActive ? "project-pane-card--active" : "",
            item.running ? "ticket-card--running project-pane-card--running" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const style: CSSProperties = item.running
            ? ({ "--ticket-running-accent": "#22c55e" } as CSSProperties)
            : {};

          return (
            <button
              key={item.id}
              type="button"
              className={className}
              style={style}
              onClick={() => onSelectProject(item.id)}
              aria-pressed={isActive}
              title={item.slug ? `${item.name} (${item.slug})` : item.name}
              aria-label={
                item.runningCount > 0
                  ? `${item.name}, ${item.runningCount} running ticket${item.runningCount === 1 ? "" : "s"}`
                  : item.name
              }
            >
              <div className="project-pane-card__header">
                <span className="project-pane-card__title">{item.name}</span>
              </div>

              {item.running ? (
                <span className="project-pane-card__status" aria-hidden="true">
                  <span className="project-pane-card__status-dot" />
                  <span className="project-pane-card__status-count">{item.runningCount > 0 ? item.runningCount : ""}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
});
