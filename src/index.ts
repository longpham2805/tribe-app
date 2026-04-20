import "reflect-metadata";
import { AppDataSource } from "./data-source";

async function main() {
  try {
    await AppDataSource.initialize();
    console.log("Tribe: Database connection established.");
  } catch (error) {
    console.error("Failed to connect to database:", error);
    process.exit(1);
  }
}

main();
