import { postMonday, type MondayPostContext } from "./graphqlClient";
import type { MondayColumnRaw, MondayGroup, MondayItem } from "./types";

type StatusLabel = { id: number; name: string };

type EnumLiteral = { __enum: string };

type ItemsQueryRule = {
  column_id: string;
  compare_value?: (string | number)[] | null;
  operator?: EnumLiteral;
};

type ItemsQueryParams = {
  rules?: ItemsQueryRule[];
  operator?: EnumLiteral;
};

type BoardMeta = {
  groupTitleToId: Map<string, string>;
  statusColumnId?: string;
  statusLabelToIndex: Map<string, number>;
};

function safeJsonParse<T>(text: string | null | undefined): T | null {
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
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

function buildBoardMeta(args: {
  groups?: MondayGroup[];
  columns?: MondayColumnRaw[];
}): BoardMeta {
  const groupTitleToId = new Map<string, string>();
  for (const g of args.groups ?? []) {
    if (!g?.id || !g?.title) continue;
    groupTitleToId.set(g.title.trim().toLowerCase(), g.id);
  }

  const statusLabelToIndex = new Map<string, number>();
  let statusColumnId: string | undefined;

  const columns = args.columns ?? [];
  const statusColumn = columns.find((c) => isStatusLikeColumnType(c.type));
  if (statusColumn) {
    statusColumnId = statusColumn.id;
    const labels = extractStatusLabels(statusColumn) ?? [];
    for (const label of labels) {
      statusLabelToIndex.set(label.name.trim().toLowerCase(), label.id);
    }
  }

  return { groupTitleToId, statusColumnId, statusLabelToIndex };
}

function buildItemsPageRules(
  boardMeta: BoardMeta,
  filters: {
    people?: string[];
    statuses?: string[];
    groups?: string[];
  },
): ItemsQueryRule[] {
  const rules: ItemsQueryRule[] = [];

  if (filters.people && filters.people.length > 0) {
    rules.push({
      column_id: "people",
      compare_value: filters.people,
      operator: { __enum: "contains_text" },
    });
  }

  if (
    filters.statuses &&
    filters.statuses.length > 0 &&
    boardMeta.statusColumnId &&
    boardMeta.statusLabelToIndex.size > 0
  ) {
    const indices: number[] = [];
    for (const name of filters.statuses) {
      const idx = boardMeta.statusLabelToIndex.get(name.trim().toLowerCase());
      if (typeof idx === "number") indices.push(idx);
    }
    if (indices.length > 0) {
      rules.push({
        column_id: boardMeta.statusColumnId,
        compare_value: indices,
      });
    }
  }

  if (filters.groups && filters.groups.length > 0) {
    const groupIds: string[] = [];
    for (const title of filters.groups) {
      const id = boardMeta.groupTitleToId.get(title.trim().toLowerCase());
      if (id) groupIds.push(id);
    }
    if (groupIds.length > 0) {
      rules.push({
        column_id: "group",
        compare_value: groupIds,
        operator: { __enum: "any_of" },
      });
    }
  }

  return rules;
}

function toGraphQLInput(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => toGraphQLInput(v)).join(", ")}]`;
  }
  if (value === null) return "null";
  if (typeof value === "object" && value !== null) {
    if (
      "__enum" in (value as Record<string, unknown>) &&
      typeof (value as Record<string, unknown>).__enum === "string"
    ) {
      return (value as Record<string, unknown>).__enum as string;
    }
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, val]) => `${key}: ${toGraphQLInput(val)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}

export type GetItemsArgs = {
  boardIds?: number[];
  people?: string[];
  statuses?: string[];
  groups?: string[];
};

export async function fetchItems(
  ctx: MondayPostContext,
  boardIds: number[],
  args: GetItemsArgs,
): Promise<{ items: MondayItem[] }> {
  const hasFilters =
    (args.people && args.people.length > 0) ||
    (args.statuses && args.statuses.length > 0) ||
    (args.groups && args.groups.length > 0);

  let rules: ItemsQueryRule[] = [];

  if (hasFilters) {
    const metaQuery = `query GetBoardMeta {
  boards(ids: [${boardIds.join(", ")}]) {
    id
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
  }
}`;

    try {
      const metaData = await postMonday<{
        boards?: Array<{
          id: string;
          groups?: MondayGroup[];
          columns?: MondayColumnRaw[];
        }>;
      }>(ctx, {
        query: metaQuery,
        operationName: "GetBoardMeta",
      });

      const firstBoard = metaData.boards?.[0];
      if (firstBoard) {
        const boardMeta = buildBoardMeta({
          groups: firstBoard.groups,
          columns: firstBoard.columns,
        });
        rules = buildItemsPageRules(boardMeta, {
          people: args.people,
          statuses: args.statuses,
          groups: args.groups,
        });
      }
    } catch {
      // If meta query fails, proceed without server-side query_params (matches loose behavior)
      rules = [];
    }
  }

  const queryParams: ItemsQueryParams | undefined =
    rules.length > 0 ? { rules, operator: { __enum: "and" } } : undefined;

  const queryParamsLiteral = queryParams
    ? `, query_params: ${toGraphQLInput(queryParams)}`
    : "";

  const query = `query GetBoardItems {
  boards(ids: [${boardIds.join(", ")}]) {
    items_page(limit: 500${queryParamsLiteral}) {
      items {
        id
        name
        group {
          id
          title
        }
        column_values {
          id
          text
        }
        subitems {
          id
          name
          group {
            id
            title
          }
          column_values {
            id
            text
          }
        }
      }
    }
  }
}`;

  const data = await postMonday<{
    boards?: Array<{ items_page?: { items?: MondayItem[] } }>;
  }>(ctx, {
    query,
    operationName: "GetBoardItems",
  });

  const allItems: MondayItem[] = [];
  for (const board of data.boards ?? []) {
    const items = board.items_page?.items ?? [];
    allItems.push(...items);
  }

  const peopleFilters = (args.people ?? []).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const statusFilters = (args.statuses ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const groupFilters = (args.groups ?? []).map((g) => g.trim().toLowerCase()).filter(Boolean);

  const filteredItems = allItems.filter((item) => {
    if (groupFilters.length > 0) {
      const groupTitle = item.group?.title?.trim().toLowerCase();
      if (!groupTitle || !groupFilters.includes(groupTitle)) {
        return false;
      }
    }

    if (statusFilters.length > 0) {
      const hasStatus = item.column_values?.some((cv) => {
        const text = cv.text?.trim().toLowerCase() ?? "";
        return statusFilters.includes(text);
      });
      if (!hasStatus) return false;
    }

    if (peopleFilters.length > 0) {
      const allText = (item.column_values ?? [])
        .map((cv) => cv.text ?? "")
        .join(" ")
        .toLowerCase();
      const hasPerson = peopleFilters.some((p) => allText.includes(p));
      if (!hasPerson) return false;
    }

    return true;
  });

  return { items: filteredItems };
}
