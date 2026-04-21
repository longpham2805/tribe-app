import { postMonday, type MondayPostContext } from "./graphqlClient";
import { parseItemId } from "./parseItemId";
import type { UpdateItemPeopleResult, UpdateItemStatusResult } from "./types";
import { MondayClientError } from "./types";

export async function changeItemStatus(
  ctx: MondayPostContext,
  args: {
    itemIdOrLink: string;
    boardId: number;
    statusLabel?: string;
    statusIndex?: number;
    columnId?: string;
  },
): Promise<UpdateItemStatusResult> {
  const itemId = parseItemId(args.itemIdOrLink ?? "");
  if (itemId == null) {
    throw new MondayClientError(
      "validation",
      `Could not parse item ID from "${args.itemIdOrLink}". Provide a numeric item ID or a Monday item URL containing /pulses/<id>.`,
    );
  }

  const hasLabel = typeof args.statusLabel === "string" && args.statusLabel.trim().length > 0;
  const hasIndex = typeof args.statusIndex === "number";
  if ((hasLabel && hasIndex) || (!hasLabel && !hasIndex)) {
    throw new MondayClientError(
      "validation",
      "Provide exactly one of statusLabel or statusIndex.",
    );
  }

  const columnId = (args.columnId?.trim() || "status").trim();
  const valueObj = hasLabel
    ? { label: args.statusLabel!.trim() }
    : { index: args.statusIndex! };
  const value = JSON.stringify(valueObj);

  const mutation = `mutation ChangeStatus($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
  change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
    id
  }
}`;

  const boardId = args.boardId;
  if (!boardId) {
    throw new MondayClientError("validation", "No board ID provided.");
  }

  const data = await postMonday<{ change_column_value?: { id: string } | null }>(ctx, {
    query: mutation,
    operationName: "ChangeStatus",
    variables: {
      boardId: String(boardId),
      itemId: String(itemId),
      columnId,
      value,
    },
  });

  const updatedId = data.change_column_value?.id ?? null;
  return {
    ok: updatedId != null,
    boardId: String(boardId),
    itemId: String(itemId),
    columnId,
    value: valueObj,
    updatedItemId: updatedId,
  };
}

export async function changeItemPeople(
  ctx: MondayPostContext,
  args: {
    itemIdOrLink: string;
    boardId: number;
    personIds: Array<string | number>;
    columnId?: string;
  },
): Promise<UpdateItemPeopleResult> {
  const itemId = parseItemId(args.itemIdOrLink ?? "");
  if (itemId == null) {
    throw new MondayClientError(
      "validation",
      `Could not parse item ID from "${args.itemIdOrLink}". Provide a numeric item ID or a Monday item URL containing /pulses/<id>.`,
    );
  }

  const ids: number[] = [];
  for (const raw of args.personIds) {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isInteger(n) || n <= 0) {
      throw new MondayClientError(
        "validation",
        `Invalid person id "${raw}". Each entry must be a positive integer Monday user id.`,
      );
    }
    ids.push(n);
  }

  const columnId = (args.columnId?.trim() || "people").trim();
  const valueObj = {
    personsAndTeams: ids.map((id) => ({ id, kind: "person" as const })),
  };
  const value = JSON.stringify(valueObj);

  const mutation = `mutation ChangePeople($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
  change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
    id
  }
}`;

  const boardId = args.boardId;
  const data = await postMonday<{ change_column_value?: { id: string } | null }>(ctx, {
    query: mutation,
    operationName: "ChangePeople",
    variables: {
      boardId: String(boardId),
      itemId: String(itemId),
      columnId,
      value,
    },
  });

  const updatedId = data.change_column_value?.id ?? null;
  return {
    ok: updatedId != null,
    boardId: String(boardId),
    itemId: String(itemId),
    columnId,
    personIds: ids,
    updatedItemId: updatedId,
  };
}
