import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTicketStatus1746800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `ticket` ADD `status` enum('DRAFT','READY') NOT NULL DEFAULT 'READY'"
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `ticket` DROP COLUMN `status`");
  }
}
