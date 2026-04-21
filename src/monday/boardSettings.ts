import { postMonday, type MondayPostContext } from "./graphqlClient";
import type {
  BoardSettingsBoard,
  BoardStatusColumnInfo,
  MondayColumnRaw,
  MondayGroup,
  MondayUser,
  StatusLabel,
} from "./types";

function safeJsonParse<T>(text: string | null | undefined): T | null {
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function uniqueUsers(users: MondayUser[]): MondayUser[] {
  const byId = new Map<string, MondayUser>();
  for (const u of users) {
    if (!u?.id) continue;
    if (!byId.has(u.id)) byId.set(u.id, u);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function extractStatusLabels(column: MondayColumnRaw): StatusLabel[] | null {
  const parsed = safeJsonParse<{ labels?: Record<string, string> }>(column.settings_str);
  const labels = parsed?.labels;
  if (!labels) return null;

  const out: StatusLabel[] = [];
  for (const [key, value] of Object.entries(labels)) {
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    if (typeof value !== "string") continue;
    out.push({ id, name: value });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
}

function isStatusLikeColumnType(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t === "color" || t === "status";
}

export async function fetchBoardSettings(
  ctx: MondayPostContext,
  boardIds: number[],
): Promise<{ boards: BoardSettingsBoard[] }> {
  const query = `query GetBoardSettings {
  boards(ids: [${boardIds.join(", ")}]) {
    id
    name
    groups {
      id
      title
    }
    columns {
      id
      title
      type
      settings_str
    }
    subscribers {
      id
      name
      email
    }
    owners {
      id
      name
      email
    }
  }
}`;

  type RawBoard = {
    id: string;
    name: string;
    groups?: MondayGroup[];
    columns?: MondayColumnRaw[];
    subscribers?: MondayUser[];
    owners?: MondayUser[];
  };

  const data = await postMonday<{ boards?: RawBoard[] }>(ctx, {
    query,
    operationName: "GetBoardSettings",
  });

  const boardsRaw = data.boards ?? [];
  const boards: BoardSettingsBoard[] = boardsRaw.map((b) => {
    const groups = (b.groups ?? []).slice().sort((a, c) => a.title.localeCompare(c.title));
    const columns = b.columns ?? [];

    const statusColumns: BoardStatusColumnInfo[] = columns
      .filter((c) => isStatusLikeColumnType(c.type))
      .map((c) => ({
        id: c.id,
        title: c.title,
        type: c.type,
        labels: extractStatusLabels(c),
      }))
      .sort((a, c) => a.title.localeCompare(c.title));

    const people = uniqueUsers([...(b.subscribers ?? []), ...(b.owners ?? [])]);

    return {
      id: b.id,
      name: b.name,
      groups,
      statusColumns,
      people,
    };
  });

  return { boards };
}
