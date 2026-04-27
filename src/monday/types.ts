/** Column value on an item or subitem */
export type ColumnValue = { id: string; text: string | null };

/** Board row returned by items_page queries */
export type MondayItem = {
  id: string;
  name: string;
  updated_at?: string;
  column_values: ColumnValue[];
  subitems: MondayItem[];
  group?: {
    id: string;
    title: string;
  };
};

export type MondayGroup = { id: string; title: string };

export type MondayUser = { id: string; name: string; email?: string | null };

export type MondayColumnRaw = {
  id: string;
  title: string;
  type: string;
  settings_str?: string | null;
};

export type StatusLabel = { id: number; name: string };

export type BoardStatusColumnInfo = {
  id: string;
  title: string;
  type: string;
  labels: StatusLabel[] | null;
};

export type BoardSettingsBoard = {
  id: string;
  name: string;
  groups: MondayGroup[];
  statusColumns: BoardStatusColumnInfo[];
  people: MondayUser[];
};

export type MondayReply = {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  creator: MondayUser | null;
};

export type MondayUpdate = {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  creator: MondayUser | null;
  replies?: MondayReply[];
};

export type MondayItemDetail = {
  id: string;
  name: string;
  board?: {
    id: string;
  };
  column_values: ColumnValue[];
  updates?: MondayUpdate[];
};

export type UpdateItemStatusResult = {
  ok: boolean;
  boardId: string;
  itemId: string;
  columnId: string;
  value: { label: string } | { index: number };
  updatedItemId: string | null;
};

export type UpdateItemPeopleResult = {
  ok: boolean;
  boardId: string;
  itemId: string;
  columnId: string;
  personIds: number[];
  updatedItemId: string | null;
};

export type ChecklistUpsertResult =
  | {
      action: "edited";
      itemId: string;
      updateId: string;
      ok: boolean;
      pinned: boolean;
      pinAction: string;
      pinMutation: string | null;
      pinWarning: string | null;
    }
  | {
      action: "created";
      itemId: string;
      updateId: string | null;
      ok: boolean;
      pinned: boolean;
      pinAction: string;
      pinMutation: string | null;
      pinWarning: string | null;
      note: string;
    };

export type MondayErrorKind =
  | "missing_token"
  | "http"
  | "graphql"
  | "validation"
  | "not_found";

export class MondayClientError extends Error {
  readonly kind: MondayErrorKind;

  constructor(kind: MondayErrorKind, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "MondayClientError";
    this.kind = kind;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export const DEFAULT_MONDAY_API_URL = "https://ewebinar-team.monday.com/v2";
export const DEFAULT_MONDAY_BOARD_IDS = [626076134] as const;
