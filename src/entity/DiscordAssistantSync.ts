import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export type DiscordAssistantSyncEntityType = "message" | "action";
export type DiscordAssistantSyncDirection = "tribe_to_discord" | "discord_to_tribe";

@Entity()
@Index(
  "UQ_discord_assistant_sync_entity_direction",
  ["entityType", "entityId", "discordChannelId", "direction"],
  { unique: true },
)
@Index("UQ_discord_assistant_sync_discord_message", ["discordMessageId"], { unique: true })
export class DiscordAssistantSync {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 32 })
  entityType!: DiscordAssistantSyncEntityType;

  @Column({ type: "int" })
  entityId!: number;

  @Column({ type: "varchar", length: 64 })
  discordChannelId!: string;

  @Column({ type: "varchar", length: 64 })
  discordMessageId!: string;

  @Column({ type: "varchar", length: 32 })
  direction!: DiscordAssistantSyncDirection;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
