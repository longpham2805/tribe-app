import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { TicketPhase } from "../enum/TicketPhase";
import { CliType } from "../enum/CliType";
import { Phase } from "./Phase";
import { Slot } from "./Slot";
import { Project } from "./Project";

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

  @Column({ type: "int", nullable: true })
  mondayBoardId!: number | null;

  @Column({ type: "enum", enum: TicketPhase, default: TicketPhase.CREATED })
  currentPhase!: TicketPhase;

  @Column({ type: "enum", enum: CliType, default: CliType.CLAUDE })
  cliType!: CliType;

  @Column({ type: "mediumtext", nullable: true })
  mondayMarkdown!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  branchName!: string | null;

  @Column({ type: "json", nullable: true })
  pullRequests!: Array<{ repo: string; prUrl: string; commitSha: string }> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => Phase, (phase) => phase.ticket, { cascade: true })
  phases!: Phase[];

  /** The workspace slot assigned to this ticket (null = no slot yet) */
  @Column({ type: "int", nullable: true })
  slotId!: number | null;

  @ManyToOne(() => Slot, { nullable: true, onDelete: "SET NULL", eager: false })
  @JoinColumn({ name: "slotId" })
  slot!: Slot | null;

  /** True when the ticket is queued waiting for a free slot */
  @Column({ type: "boolean", default: false })
  waitingForSlot!: boolean;

  /** Stable UUID assigned when the ticket's workspace is first set up */
  @Column({ type: "varchar", length: 36, nullable: true, unique: true })
  uid!: string | null;

  @Column({ type: "int", nullable: true })
  projectId!: number | null;

  @ManyToOne(() => Project, (p) => p.tickets, { nullable: true, onDelete: "SET NULL", eager: false })
  @JoinColumn({ name: "projectId" })
  project!: Project | null;
}
