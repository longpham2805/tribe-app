import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { CliType } from "../enum/CliType";

@Entity()
export class AppState {
  @PrimaryColumn({ type: "int" })
  id!: number;

  @Column({ type: "boolean", default: true })
  autoTriggerEnabled!: boolean;

  @Column({ type: "json" })
  availableCliTypes!: CliType[];

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: "boolean", default: true })
  assistantAutoActionsEnabled!: boolean;

  @Column({ type: "varchar", length: 100, nullable: true })
  assistantModel!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  discordBotToken!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  discordAssistantThreadId!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
