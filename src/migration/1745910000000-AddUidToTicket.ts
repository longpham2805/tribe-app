import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUidToTicket1745910000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ticket\` ADD \`uid\` varchar(36) NULL UNIQUE`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`ticket\` DROP COLUMN \`uid\``);
  }
}
