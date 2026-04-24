import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Ticket } from "./Ticket";
import { Slot } from "./Slot";

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 100, unique: true })
  name!: string;

  @Column({ type: "varchar", length: 100, nullable: true, unique: true })
  slug!: string | null;

  @Column({ type: "json", nullable: true })
  mondayBoardIds!: number[] | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  mondayDefaultPersonId!: string | null;

  @Column({ type: "json", nullable: true })
  mondayDevPeople!: string[] | null;

  @OneToMany(() => Ticket, (t) => t.project)
  tickets!: Ticket[];

  @OneToMany(() => Slot, (s) => s.project)
  slots!: Slot[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
