import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLogoPathToProject1746800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`project\` ADD \`logo_path\` varchar(500) NULL`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`project\` DROP COLUMN \`logo_path\``);
  }
}
