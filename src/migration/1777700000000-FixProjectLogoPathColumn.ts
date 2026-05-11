import { MigrationInterface, QueryRunner } from "typeorm";

export class FixProjectLogoPathColumn1777700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const hasProjectTable = await queryRunner.hasTable("project");
    if (!hasProjectTable) return;

    const hasLogoPath = await queryRunner.hasColumn("project", "logoPath");
    const hasLegacyLogoPath = await queryRunner.hasColumn("project", "logo_path");

    if (!hasLogoPath && hasLegacyLogoPath) {
      await queryRunner.query("ALTER TABLE `project` CHANGE `logo_path` `logoPath` varchar(500) NULL");
      return;
    }

    if (!hasLogoPath) {
      await queryRunner.query("ALTER TABLE `project` ADD COLUMN `logoPath` varchar(500) NULL");
      return;
    }

    if (hasLegacyLogoPath) {
      await queryRunner.query("UPDATE `project` SET `logoPath` = COALESCE(`logoPath`, `logo_path`)");
      await queryRunner.query("ALTER TABLE `project` DROP COLUMN `logo_path`");
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const hasProjectTable = await queryRunner.hasTable("project");
    if (!hasProjectTable) return;

    const hasLogoPath = await queryRunner.hasColumn("project", "logoPath");
    const hasLegacyLogoPath = await queryRunner.hasColumn("project", "logo_path");

    if (hasLogoPath && !hasLegacyLogoPath) {
      await queryRunner.query("ALTER TABLE `project` CHANGE `logoPath` `logo_path` varchar(500) NULL");
      return;
    }

    if (hasLogoPath) {
      await queryRunner.query("UPDATE `project` SET `logo_path` = COALESCE(`logo_path`, `logoPath`)");
      await queryRunner.query("ALTER TABLE `project` DROP COLUMN `logoPath`");
    }
  }
}
