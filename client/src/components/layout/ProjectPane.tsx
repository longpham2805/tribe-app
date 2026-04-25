import { memo, type CSSProperties } from "react";
import type { Project } from "../../types";

interface ProjectPaneProps {
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (projectId: number) => void;
}

const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
const FALLBACK_PROJECT_COLORS = [
  { backgroundColor: "#1D4ED8", textColor: "#EFF6FF" },
  { backgroundColor: "#0F766E", textColor: "#CCFBF1" },
  { backgroundColor: "#B45309", textColor: "#FFFBEB" },
  { backgroundColor: "#7C3AED", textColor: "#F5F3FF" },
  { backgroundColor: "#BE123C", textColor: "#FFF1F2" },
  { backgroundColor: "#334155", textColor: "#F8FAFC" },
];

function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value);
}

function getProjectPalette(project: Project) {
  const fallback = FALLBACK_PROJECT_COLORS[(project.id - 1) % FALLBACK_PROJECT_COLORS.length];
  return {
    backgroundColor: isHexColor(project.primaryColor) ? project.primaryColor : fallback.backgroundColor,
    textColor: isHexColor(project.actionColor) ? project.actionColor : fallback.textColor,
  };
}

function getProjectInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export const ProjectPane = memo(function ProjectPane({
  projects,
  selectedProjectId,
  onSelectProject,
}: ProjectPaneProps) {
  const items = projects.map((project) => ({
    id: project.id,
    name: project.name,
    running: !!project.hasRunningTickets,
    runningCount: project.runningTicketCount ?? 0,
    initial: getProjectInitial(project.name),
    ...getProjectPalette(project),
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
            ? ({
                backgroundColor: item.backgroundColor,
                color: item.textColor,
                "--ticket-running-accent": "#22c55e",
              } as CSSProperties)
            : {
                backgroundColor: item.backgroundColor,
                color: item.textColor,
              };

          return (
            <button
              key={item.id}
              type="button"
              className={className}
              style={style}
              onClick={() => onSelectProject(item.id)}
              aria-pressed={isActive}
              title={item.name}
              aria-label={
                item.runningCount > 0
                  ? `${item.name}, ${item.runningCount} running ticket${item.runningCount === 1 ? "" : "s"}`
                  : item.name
              }
            >
              <div className="project-pane-card__header">
                <span className="project-pane-card__title" aria-hidden="true">{item.initial}</span>
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
