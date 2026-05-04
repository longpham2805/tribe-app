import type { Project } from "../types";
import { API_BASE, readApiError, readJson } from "./request";

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
  fastTrack?: boolean;
};

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return readJson<Project[]>(res);
}

export async function createProject(data: ProjectPayload): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to create project"));
  return readJson<Project>(res);
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
  if (!res.ok) throw new Error(await readApiError(res, "Failed to update project"));
  return readJson<Project>(res);
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to delete project"));
}
