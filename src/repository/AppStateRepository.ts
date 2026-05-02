import { Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import { AppState } from "../entity/AppState";
import { CliType } from "../enum/CliType";

const APP_STATE_ID = 1;

export const DEFAULT_AVAILABLE_CLI_TYPES = Object.values(CliType);

export function normalizeNullableSetting(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? null;
  return normalized ? normalized : null;
}

export class AppStateRepository {
  private repo: Repository<AppState>;

  constructor() {
    this.repo = AppDataSource.getRepository(AppState);
  }

  async get(): Promise<AppState> {
    const existing = await this.repo.findOne({ where: { id: APP_STATE_ID } });
    if (existing) return this.normalize(existing);

    const state = this.repo.create({
      id: APP_STATE_ID,
      autoTriggerEnabled: true,
      availableCliTypes: DEFAULT_AVAILABLE_CLI_TYPES,
      assistantAutoActionsEnabled: true,
      assistantModel: null,
      discordBotToken: null,
      discordAssistantThreadId: null,
    });
    return this.repo.save(state);
  }

  async update(data: {
    autoTriggerEnabled?: boolean;
    availableCliTypes?: CliType[];
    assistantAutoActionsEnabled?: boolean;
    assistantModel?: string | null;
    discordBotToken?: string | null;
    discordAssistantThreadId?: string | null;
  }): Promise<AppState> {
    const state = await this.get();

    if (data.autoTriggerEnabled !== undefined) {
      state.autoTriggerEnabled = data.autoTriggerEnabled;
    }
    if (data.availableCliTypes !== undefined) {
      state.availableCliTypes = [...new Set(data.availableCliTypes)];
    }
    if (data.assistantAutoActionsEnabled !== undefined) {
      state.assistantAutoActionsEnabled = data.assistantAutoActionsEnabled;
    }
    if (data.assistantModel !== undefined) {
      state.assistantModel = normalizeNullableSetting(data.assistantModel);
    }
    if (data.discordBotToken !== undefined) {
      state.discordBotToken = normalizeNullableSetting(data.discordBotToken);
    }
    if (data.discordAssistantThreadId !== undefined) {
      state.discordAssistantThreadId = normalizeNullableSetting(data.discordAssistantThreadId);
    }

    return this.repo.save(state);
  }

  async isAutoTriggerEnabled(): Promise<boolean> {
    return (await this.get()).autoTriggerEnabled;
  }

  async isCliAvailable(cliType: CliType): Promise<boolean> {
    return (await this.get()).availableCliTypes.includes(cliType);
  }

  private normalize(state: AppState): AppState {
    if (!Array.isArray(state.availableCliTypes)) {
      state.availableCliTypes = DEFAULT_AVAILABLE_CLI_TYPES;
    }
    state.availableCliTypes = state.availableCliTypes.filter((cliType) =>
      DEFAULT_AVAILABLE_CLI_TYPES.includes(cliType),
    );
    state.assistantModel = normalizeNullableSetting(state.assistantModel);
    state.discordBotToken = normalizeNullableSetting(state.discordBotToken);
    state.discordAssistantThreadId = normalizeNullableSetting(state.discordAssistantThreadId);
    return state;
  }
}
