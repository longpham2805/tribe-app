import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export type ActionType =
  | "RETRY_PHASE"
  | "REBASE_AND_CONTINUE"
  | "RESPOND_TO_PHASE"
  | "TRIGGER_PHASE"
  | "OTHER";

export type ActionStatus = "proposed" | "approved" | "rejected" | "executed" | "failed";
export type ActionSource = "auto" | "chat" | "user";

@Entity()
export class AssistantAction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: "enum",
    enum: ["RETRY_PHASE", "REBASE_AND_CONTINUE", "RESPOND_TO_PHASE", "TRIGGER_PHASE", "OTHER"],
  })
  type!: ActionType;

  @Column({
    type: "enum",
    enum: ["proposed", "approved", "rejected", "executed", "failed"],
    default: "proposed",
  })
  status!: ActionStatus;

  @Column({ type: "json", nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  reason!: string | null;

  @Column({ type: "float", nullable: true })
  confidence!: number | null;

  @Column({ type: "enum", enum: ["auto", "chat", "user"], default: "auto" })
  source!: ActionSource;

  /** Prevents duplicate auto-actions for the same event */
  @Column({ type: "varchar", length: 500, nullable: true, unique: true })
  fingerprint!: string | null;

  @Column({ type: "int", nullable: true })
  ticketId!: number | null;

  @Column({ type: "int", nullable: true })
  messageId!: number | null;

  @Column({ type: "text", nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
