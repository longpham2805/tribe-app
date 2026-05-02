import { Repository } from "typeorm";
import { AppDataSource } from "../data-source";
import {
  DiscordAssistantSync,
  type DiscordAssistantSyncDirection,
  type DiscordAssistantSyncEntityType,
} from "../entity/DiscordAssistantSync";

export class DiscordAssistantSyncRepository {
  private repo: Repository<DiscordAssistantSync>;

  constructor() {
    this.repo = AppDataSource.getRepository(DiscordAssistantSync);
  }

  async create(data: {
    entityType: DiscordAssistantSyncEntityType;
    entityId: number;
    discordChannelId: string;
    discordMessageId: string;
    direction: DiscordAssistantSyncDirection;
  }): Promise<DiscordAssistantSync> {
    const sync = this.repo.create(data);
    return this.repo.save(sync);
  }

  async existsForEntity(
    entityType: DiscordAssistantSyncEntityType,
    entityId: number,
    discordChannelId: string,
    direction: DiscordAssistantSyncDirection,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: { entityType, entityId, discordChannelId, direction } });
    return count > 0;
  }

  async findForEntity(
    entityType: DiscordAssistantSyncEntityType,
    entityId: number,
    discordChannelId: string,
    direction: DiscordAssistantSyncDirection,
  ): Promise<DiscordAssistantSync | null> {
    return this.repo.findOne({ where: { entityType, entityId, discordChannelId, direction } });
  }

  async existsByDiscordMessageId(discordMessageId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { discordMessageId } });
    return count > 0;
  }
}
