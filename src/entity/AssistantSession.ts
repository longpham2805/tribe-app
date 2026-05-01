import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity()
export class AssistantSession {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Claude SDK session ID for resuming conversations */
  @Column({ type: "varchar", length: 255, nullable: true })
  claudeSessionId!: string | null;

  @Column({ type: "datetime", nullable: true })
  lastActiveAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
