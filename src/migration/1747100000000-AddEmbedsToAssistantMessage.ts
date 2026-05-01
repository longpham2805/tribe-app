import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmbedsToAssistantMessage1747100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`assistant_message\` ADD COLUMN \`embeds\` json NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`assistant_message\` DROP COLUMN \`embeds\``);
  }
}
