export const API_BASE = "/api";

type ApiErrorBody = {
  error?: unknown;
};

export async function readJson<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

export async function readApiError(res: Response, fallback: string): Promise<string> {
  const body = await readJson<ApiErrorBody>(res).catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

export const readErrorMessage = readApiError;
export const readJsonError = readApiError;
