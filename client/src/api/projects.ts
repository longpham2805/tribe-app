import type { Project } from "../types";
import { API_BASE, readJsonError } from "./request";

export type ProjectPayload = {
  name: string;
  slug?: string | null;
  mondayBoardIds?: number[] | null;
  mondayDefaultPersonId?: string | null;
  mondayDevPeople?: string[] | null;
  primaryColor?: string | null;
  actionColor?: string | null;
  introduction?: string | null;
  rules?: string | null;
  techStack?: string | null;
};

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function createProject(data: ProjectPayload): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to create project"));
  return res.json();
}

export async function updateProject(
  id: number,
  data: Partial<ProjectPayload>,
): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to update project"));
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to delete project"));
}
