import { fetchBoardSettings } from "./boardSettings";
import { upsertImplementationChecklist } from "./implementationChecklist";
import type { MondayPostContext } from "./graphqlClient";
import { fetchItemDetails } from "./itemDetails";
import { fetchItems, type GetItemsArgs } from "./itemsQuery";
import { changeItemPeople, changeItemStatus } from "./mutations";
import type {
  BoardSettingsBoard,
  ChecklistUpsertResult,
  MondayItem,
  MondayItemDetail,
  UpdateItemPeopleResult,
  UpdateItemStatusResult,
} from "./types";
import {
  DEFAULT_MONDAY_API_URL,
  DEFAULT_MONDAY_BOARD_IDS,
  MondayClientError,
} from "./types";

export type MondayHelperOptions = {
  /** API token; if omitted, fromEnv() must be used or each call would fail at runtime */
  accessToken?: string;
  apiUrl?: string;
  defaultBoardIds?: number[];
  /** Default people filter for getItemsForReport when peopleOverride is not passed */
  ewebinarDevPeople?: string[];
};

const NOT_STARTED_GROUPS = ["Dev Bugs", "Prod Bugs Next", "Next"] as const;

const ITEMS_FOR_REPORT_GROUPS = [
  "Coding",
  "Need PR Preview",
  "In Dev For QA",
  "Dev Passed QA",
  "In Dev Ready for QA",
] as const;

function parseBoardIdsEnv(raw: string | undefined): number[] | undefined {
  if (!raw?.trim()) return undefined;
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

function parseDevPeopleEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export class MondayHelper {
  private readonly apiUrl: string;
  private readonly accessToken: string | undefined;
  private readonly defaultBoardIds: number[];
  private readonly ewebinarDevPeople: string[];

  constructor(options: MondayHelperOptions = {}) {
    this.accessToken = options.accessToken;
    this.apiUrl = options.apiUrl ?? DEFAULT_MONDAY_API_URL;
    this.defaultBoardIds =
      options.defaultBoardIds && options.defaultBoardIds.length > 0
        ? [...options.defaultBoardIds]
        : [...DEFAULT_MONDAY_BOARD_IDS];
    this.ewebinarDevPeople = options.ewebinarDevPeople ?? [];
  }

  /**
   * Reads MONDAY_ACCESS_TOKEN, EWEBINAR_DEV_PEOPLE, optional MONDAY_API_URL, MONDAY_DEFAULT_BOARD_IDS.
   */
  static fromEnv(): MondayHelper {
    return new MondayHelper({
      accessToken: process.env.MONDAY_ACCESS_TOKEN,
      apiUrl: process.env.MONDAY_API_URL,
      defaultBoardIds: parseBoardIdsEnv(process.env.MONDAY_DEFAULT_BOARD_IDS),
      ewebinarDevPeople: parseDevPeopleEnv(process.env.EWEBINAR_DEV_PEOPLE),
    });
  }

  private ctx(): MondayPostContext {
    const accessToken = this.accessToken?.trim();
    if (!accessToken) {
      throw new MondayClientError(
        "missing_token",
        "Error: MONDAY_ACCESS_TOKEN environment variable is not set.",
      );
    }
    return { apiUrl: this.apiUrl, accessToken };
  }

  /** Same as personal-mcp getMondayBoardSettings */
  async getBoardSettings(boardIds?: number[]): Promise<{ boards: BoardSettingsBoard[] }> {
    return fetchBoardSettings(this.ctx(), boardIds ?? this.defaultBoardIds);
  }

  /** Same as personal-mcp getMondayItemDetails */
  async getItemDetails(itemIdOrLink: string): Promise<{ item: MondayItemDetail }> {
    return fetchItemDetails(this.ctx(), itemIdOrLink);
  }

  /** Same as personal-mcp getMondayItems */
  async getItems(args: GetItemsArgs = {}): Promise<{ items: MondayItem[] }> {
    const boardIds = args.boardIds?.length ? args.boardIds : this.defaultBoardIds;
    return fetchItems(this.ctx(), boardIds, args);
  }

  /** Same as personal-mcp getNotStartedItems */
  async getNotStartedItems(args?: {
    boardIds?: number[];
    peopleOverride?: string[];
  }): Promise<{ items: MondayItem[] }> {
    const groups = [...NOT_STARTED_GROUPS];
    const baseArgs: GetItemsArgs = {
      boardIds: args?.boardIds,
      groups,
    };
    if (args?.peopleOverride && args.peopleOverride.length > 0) {
      baseArgs.people = args.peopleOverride;
    }
    return this.getItems(baseArgs);
  }

  /** Same as personal-mcp getItemsForReport */
  async getItemsForReport(args?: {
    boardIds?: number[];
    peopleOverride?: string[];
  }): Promise<{ items: MondayItem[] }> {
    const groups = [...ITEMS_FOR_REPORT_GROUPS];
    const effectivePeople =
      args?.peopleOverride && args.peopleOverride.length > 0
        ? args.peopleOverride
        : this.ewebinarDevPeople;

    if (!effectivePeople || effectivePeople.length === 0) {
      throw new MondayClientError(
        "validation",
        "Error: No people filter configured. Set EWEBINAR_DEV_PEOPLE env or pass peopleOverride to getItemsForReport.",
      );
    }

    return this.getItems({
      boardIds: args?.boardIds,
      groups,
      people: effectivePeople,
    });
  }

  /** Same as personal-mcp updateMondayItemStatus */
  async updateItemStatus(params: {
    itemIdOrLink: string;
    boardId: number;
    statusLabel?: string;
    statusIndex?: number;
    columnId?: string;
  }): Promise<UpdateItemStatusResult> {
    return changeItemStatus(this.ctx(), params);
  }

  /** Same as personal-mcp updateMondayItemPeople */
  async updateItemPeople(params: {
    itemIdOrLink: string;
    boardId: number;
    personIds: Array<string | number>;
    columnId?: string;
  }): Promise<UpdateItemPeopleResult> {
    return changeItemPeople(this.ctx(), params);
  }

  /** Same as personal-mcp upsertMondayImplementationChecklist */
  async upsertImplementationChecklist(params: {
    itemIdOrLink: string;
    person: string;
    content: string;
  }): Promise<ChecklistUpsertResult> {
    return upsertImplementationChecklist(this.ctx(), params);
  }
}

export {
  DEFAULT_MONDAY_API_URL,
  DEFAULT_MONDAY_BOARD_IDS,
  MondayClientError,
} from "./types";
export { parseItemId } from "./parseItemId";
