import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import type { AssistantMessageEmbed } from "../shared/assistantEmbed";

export type MessageRole = "user" | "assistant" | "system";
export type MessageSeverity = "info" | "warn" | "error";
export type AssistantMessageOrigin = "tribe_ui" | "discord" | "system";
export interface AssistantMessageMetadata extends Record<string, unknown> {
  origin?: AssistantMessageOrigin;
  discord?: {
    authorId?: string;
    authorUsername?: string;
    authorDisplayName?: string;
    channelId?: string;
    messageId?: string;
  };
}
export type { AssistantMessageEmbed };

@Entity()
export class AssistantMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "enum", enum: ["user", "assistant", "system"], default: "assistant" })
  role!: MessageRole;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "int", nullable: true })
  ticketId!: number | null;

  @Column({ type: "int", nullable: true })
  phaseId!: number | null;

  @Column({ type: "enum", enum: ["info", "warn", "error"], default: "info" })
  severity!: MessageSeverity;

  @Column({ type: "datetime", nullable: true })
  readAt!: Date | null;

  /** Dedupe key: `${ticketId}:${phaseId}:${status}:${errorFingerprint}` */
  @Column({ type: "varchar", length: 500, nullable: true, unique: true })
  sourceEventKey!: string | null;

  @Column({ type: "json", nullable: true })
  metadata!: AssistantMessageMetadata | null;

  @Column({ type: "json", nullable: true })
  embeds!: AssistantMessageEmbed[] | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
