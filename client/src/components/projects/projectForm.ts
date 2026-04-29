import type { Project } from "../../types";

export type EditState = {
  name: string;
  mondayBoardIds: string;
  mondayDefaultPersonId: string;
  mondayDevPeople: string;
  primaryColor: string;
  actionColor: string;
  introduction: string;
  rules: string;
  techStack: string;
};

export type ProjectModalMode = "create" | "configure";

export const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;
export const MAX_PROJECT_CONTEXT_FIELD_CHARS = 4000;

export function parseBoardIds(raw: string): number[] | null {
  const ids = raw.split(",").map((v) => parseInt(v.trim(), 10)).filter((v) => Number.isInteger(v) && v > 0);
  return ids.length > 0 ? ids : null;
}

export function parsePeople(raw: string): string[] | null {
  const people = raw.split(",").map((v) => v.trim()).filter(Boolean);
  return people.length > 0 ? people : null;
}

export function normalizeHexColorInput(raw: string, fieldLabel: string): string | null {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return null;
  if (!HEX_COLOR_PATTERN.test(normalized)) throw new Error(`${fieldLabel} must be in #RRGGBB format`);
  return normalized;
}

export function normalizeProjectContextInput(raw: string): string | null {
  const normalized = raw.trim();
  return normalized || null;
}

export function toEditState(project: Project): EditState {
  return {
    name: project.name,
    mondayBoardIds: (project.mondayBoardIds ?? []).join(", "),
    mondayDefaultPersonId: project.mondayDefaultPersonId ?? "",
    mondayDevPeople: (project.mondayDevPeople ?? []).join(", "),
    primaryColor: project.primaryColor ?? "",
    actionColor: project.actionColor ?? "",
    introduction: project.introduction ?? "",
    rules: project.rules ?? "",
    techStack: project.techStack ?? "",
  };
}

export function emptyEditState(): EditState {
  return {
    name: "",
    mondayBoardIds: "",
    mondayDefaultPersonId: "",
    mondayDevPeople: "",
    primaryColor: "",
    actionColor: "",
    introduction: "",
    rules: "",
    techStack: "",
  };
}
