import { MigrationInterface, QueryRunner } from "typeorm";

export class ReplaceSlotPathsWithRootPath1745900100000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`slot\` ADD \`rootPath\` varchar(500) NOT NULL DEFAULT ''`
    );
    await queryRunner.query(
      `ALTER TABLE \`slot\` DROP COLUMN \`backendPath\``
    );
    await queryRunner.query(
      `ALTER TABLE \`slot\` DROP COLUMN \`frontendPath\``
    );
    // Remove the DEFAULT now that existing rows are handled
    await queryRunner.query(
      `ALTER TABLE \`slot\` ALTER COLUMN \`rootPath\` DROP DEFAULT`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`slot\` ADD \`backendPath\` varchar(500) NOT NULL DEFAULT ''`
    );
    await queryRunner.query(
      `ALTER TABLE \`slot\` ADD \`frontendPath\` varchar(500) NOT NULL DEFAULT ''`
    );
    await queryRunner.query(
      `ALTER TABLE \`slot\` DROP COLUMN \`rootPath\``
    );
    await queryRunner.query(
      `ALTER TABLE \`slot\` ALTER COLUMN \`backendPath\` DROP DEFAULT`
    );
    await queryRunner.query(
      `ALTER TABLE \`slot\` ALTER COLUMN \`frontendPath\` DROP DEFAULT`
    );
  }
}
