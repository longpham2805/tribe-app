import { postMonday, type MondayPostContext } from "./graphqlClient";
import { parseItemId } from "./parseItemId";
import type { MondayItemDetail } from "./types";
import { MondayClientError } from "./types";

export async function fetchItemDetails(
  ctx: MondayPostContext,
  itemIdOrLink: string,
): Promise<{ item: MondayItemDetail }> {
  const itemId = parseItemId(itemIdOrLink ?? "");
  if (itemId == null) {
    throw new MondayClientError(
      "validation",
      `Could not parse item ID from "${itemIdOrLink}". Provide a numeric item ID or a Monday item URL containing /pulses/<id>.`,
    );
  }

  const query = `query GetItem($itemId: [ID!]) {
  items(ids: $itemId) {
    id
    name
    board {
      id
    }
    column_values {
      id
      text
    }
    updates(limit: 50) {
      id
      body
      created_at
      updated_at
      creator {
        id
        name
      }
      replies {
        id
        body
        created_at
        updated_at
        creator {
          id
          name
        }
      }
    }
  }
}`;

  const data = await postMonday<{ items?: MondayItemDetail[] }>(ctx, {
    query,
    operationName: "GetItem",
    variables: { itemId: [String(itemId)] },
  });

  const items = data.items ?? [];
  if (items.length === 0) {
    throw new MondayClientError(
      "not_found",
      `No item found for ID ${itemId}. It may not exist or you may not have access.`,
    );
  }

  return { item: items[0] };
}
