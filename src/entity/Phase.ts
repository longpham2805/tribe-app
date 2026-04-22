import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { TicketPhase } from "../enum/TicketPhase";
import { PhaseStatus } from "../enum/PhaseStatus";
import { Ticket } from "./Ticket";

@Entity()
export class Phase {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Ticket, (ticket) => ticket.phases, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ticket_id" })
  ticket!: Ticket;

  @Column({ name: "ticket_id", type: "int" })
  ticketId!: number;

  @Column({ type: "enum", enum: TicketPhase })
  phaseName!: TicketPhase;

  @Column({ type: "datetime", nullable: true })
  startedAt!: Date | null;

  @Column({ type: "datetime", nullable: true })
  completedAt!: Date | null;

  @Column({ type: "enum", enum: PhaseStatus, default: PhaseStatus.PENDING })
  status!: PhaseStatus;

  @Column({ type: "text", nullable: true })
  lastMessage!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  claudeSessionUuid!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
