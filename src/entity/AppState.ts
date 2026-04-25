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

  @UpdateDateColumn()
  updatedAt!: Date;
}
