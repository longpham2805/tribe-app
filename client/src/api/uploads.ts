import { API_BASE, readJsonError } from "./request";

export async function uploadProjectLogo(projectId: number, file: File): Promise<{ logoPath: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/uploads/projects/${projectId}/logo`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to upload logo"));
  return res.json();
}

export async function uploadTicketImage(ticketId: number, file: File): Promise<{ path: string; description: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/uploads/tickets/${ticketId}/images`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await readJsonError(res, "Failed to upload image"));
  return res.json();
}
