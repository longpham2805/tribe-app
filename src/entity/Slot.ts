import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
