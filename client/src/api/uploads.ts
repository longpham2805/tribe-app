import { API_BASE, readApiError, readJson } from "./request";
import type { AssistantMessageEmbed } from "../types/assistant";

export type ProjectLogoUploadResponse = {
  logoPath: string;
};

export type TicketImageUploadResponse = {
  path: string;
  description: string;
};

export type AssistantImageEmbed = Extract<AssistantMessageEmbed, { type: "image" }>;

export type AssistantImageUploadResponse = {
  embed: AssistantImageEmbed;
};

export async function uploadProjectLogo(projectId: number, file: File): Promise<ProjectLogoUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/uploads/projects/${projectId}/logo`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to upload logo"));
  return readJson<ProjectLogoUploadResponse>(res);
}

export async function uploadTicketImage(ticketId: number, file: File): Promise<TicketImageUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/uploads/tickets/${ticketId}/images`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to upload image"));
  return readJson<TicketImageUploadResponse>(res);
}

export async function uploadAssistantImage(file: File): Promise<AssistantImageEmbed> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/uploads/assistant/images`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readApiError(res, "Failed to upload image"));
  const body = await readJson<AssistantImageUploadResponse>(res);
  return body.embed;
}
