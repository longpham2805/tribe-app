import "reflect-metadata";
import { DataSource } from "typeorm";
import { Ticket } from "./entity/Ticket";
import { Phase } from "./entity/Phase";
import { TicketSubscriber } from "./subscriber/TicketSubscriber";
import * as dotenv from "dotenv";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST || process.env.DATABASE_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || process.env.DATABASE_PORT || "3306"),
  username: process.env.DB_USERNAME || process.env.DATABASE_USER || "root",
  password: process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || "",
  database: process.env.DB_DATABASE || process.env.DATABASE_NAME || "tribe",
  synchronize: false,
  logging: true,
  entities: [Ticket, Phase],
  migrations: ["src/migration/*.ts"],
  subscribers: [TicketSubscriber],
});
