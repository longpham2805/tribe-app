import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPhaseStatusFields1745920000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `phase` ADD `status` enum('PENDING','RUNNING','COMPLETED','REQUIRES_ACTION','QUESTION','ERROR') NOT NULL DEFAULT 'PENDING'"
    );
    await queryRunner.query(
      "ALTER TABLE `phase` ADD `lastMessage` text NULL"
    );
    await queryRunner.query(
      "ALTER TABLE `phase` ADD `claudeSessionUuid` varchar(36) NULL"
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `phase` DROP COLUMN `claudeSessionUuid`");
    await queryRunner.query("ALTER TABLE `phase` DROP COLUMN `lastMessage`");
    await queryRunner.query("ALTER TABLE `phase` DROP COLUMN `status`");
  }
}
