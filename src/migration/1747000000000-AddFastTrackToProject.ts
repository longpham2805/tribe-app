import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFastTrackToProject1747000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasProjectTable = await queryRunner.hasTable("project");
    if (!hasProjectTable) return;

    const hasFastTrack = await queryRunner.hasColumn("project", "fastTrack");
    if (!hasFastTrack) {
      await queryRunner.query(`ALTER TABLE \`project\` ADD COLUMN \`fastTrack\` tinyint(1) NOT NULL DEFAULT 0`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasProjectTable = await queryRunner.hasTable("project");
    if (!hasProjectTable) return;

    const hasFastTrack = await queryRunner.hasColumn("project", "fastTrack");
    if (hasFastTrack) {
      await queryRunner.query(`ALTER TABLE \`project\` DROP COLUMN \`fastTrack\``);
    }
  }
}
