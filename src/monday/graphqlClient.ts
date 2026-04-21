import { MondayClientError } from "./types";

export type MondayPostContext = {
  apiUrl: string;
  accessToken: string;
  /** When set, sends API-Version header (required for some mutations). */
  apiVersion?: string;
};

export async function postMonday<TData>(
  ctx: MondayPostContext,
  payload: {
    query: string;
    operationName: string;
    variables?: Record<string, unknown>;
  },
): Promise<TData> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: ctx.accessToken,
  };
  if (ctx.apiVersion) {
    headers["API-Version"] = ctx.apiVersion;
  }

  let res: Response;
  try {
    res = await fetch(ctx.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: payload.query,
        operationName: payload.operationName,
        variables: payload.variables ?? {},
        enforce_hide: true,
      }),
    });
  } catch (err) {
    throw new MondayClientError(
      "http",
      `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new MondayClientError(
      "http",
      `Monday API error: ${res.status} ${res.statusText}\n${text}`,
    );
  }

  const json = (await res.json()) as {
    data?: TData;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new MondayClientError(
      "graphql",
      `Monday API errors:\n${json.errors.map((e) => e.message).join("\n")}`,
    );
  }

  if (json.data === undefined) {
    throw new MondayClientError("graphql", "Missing data in Monday API response.");
  }

  return json.data;
}

/** Like postMonday but returns errors instead of throwing (for best-effort mutations). */
export async function tryPostMonday<TData>(
  ctx: MondayPostContext,
  payload: {
    query: string;
    operationName: string;
    variables?: Record<string, unknown>;
  },
): Promise<
  | { ok: true; data: TData }
  | { ok: false; httpError?: string; gqlErrors?: string[] }
> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: ctx.accessToken,
  };
  if (ctx.apiVersion) {
    headers["API-Version"] = ctx.apiVersion;
  }

  let res: Response;
  try {
    res = await fetch(ctx.apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: payload.query,
        operationName: payload.operationName,
        variables: payload.variables ?? {},
        enforce_hide: true,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      httpError: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      httpError: `${res.status} ${res.statusText}\n${await res.text()}`,
    };
  }

  const json = (await res.json()) as {
    data?: TData;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    return { ok: false, gqlErrors: json.errors.map((e) => e.message) };
  }

  if (json.data === undefined) {
    return { ok: false, gqlErrors: ["Missing data in mutation response."] };
  }

  return { ok: true, data: json.data };
}
