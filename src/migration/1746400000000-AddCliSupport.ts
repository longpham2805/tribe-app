import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCliSupport1746400000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `ticket` ADD `cliType` enum('CLAUDE','CODEX') NOT NULL DEFAULT 'CLAUDE'"
    );
    await queryRunner.query(
      "ALTER TABLE `phase` CHANGE `claudeSessionUuid` `cliSessionId` varchar(36) NULL"
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `phase` CHANGE `cliSessionId` `claudeSessionUuid` varchar(36) NULL"
    );
    await queryRunner.query("ALTER TABLE `ticket` DROP COLUMN `cliType`");
  }
}
