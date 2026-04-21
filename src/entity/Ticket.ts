import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { TicketPhase } from "../enum/TicketPhase";
import { Phase } from "./Phase";

@Entity()
export class Ticket {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true, unique: true })
  mondayItemId!: string | null;

  @Column({ type: "enum", enum: TicketPhase, default: TicketPhase.CREATED })
  currentPhase!: TicketPhase;

  @Column({ type: "mediumtext", nullable: true })
  mondayMarkdown!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Phase, (phase) => phase.ticket, { cascade: true })
  phases!: Phase[];
}
