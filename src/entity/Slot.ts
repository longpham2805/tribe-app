import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Project } from "./Project";

@Entity()
export class Slot {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  /** Absolute path to the workspace root folder containing all repos */
  @Column({ type: "varchar", length: 500 })
  rootPath!: string;

  /** The ticket currently occupying this slot (null = free) */
  @Column({ type: "int", nullable: true })
  currentTicketId!: number | null;

  @Column({ type: "boolean", default: false })
  disabled!: boolean;

  @Column({ type: "int", nullable: true })
  projectId!: number | null;

  @ManyToOne(() => Project, (p) => p.slots, { nullable: true, onDelete: "SET NULL", eager: false })
  @JoinColumn({ name: "projectId" })
  project!: Project | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
