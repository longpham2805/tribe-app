import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectFastTrack1746900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`project\` ADD COLUMN \`fastTrack\` tinyint(1) NOT NULL DEFAULT 0 AFTER \`techStack\``
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`project\` DROP COLUMN \`fastTrack\``);
  }
}
