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

  @Column({ type: "int", default: 0 })
  sequence!: number;

  @Column({ type: "text", nullable: true })
  feedbackComment!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  branchName!: string | null;

  @Column({ type: "json", nullable: true })
  pullRequests!: Array<{ repo: string; prUrl: string; commitSha: string }> | null;

  @Column({ type: "datetime", nullable: true })
  startedAt!: Date | null;

  @Column({ type: "datetime", nullable: true })
  completedAt!: Date | null;

  @Column({ type: "enum", enum: PhaseStatus, default: PhaseStatus.PENDING })
  status!: PhaseStatus;

  @Column({ type: "text", nullable: true })
  lastMessage!: string | null;

  @Column({ type: "varchar", length: 36, nullable: true })
  cliSessionId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
