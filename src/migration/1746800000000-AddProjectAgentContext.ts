import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectAgentContext1746800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasProjectTable = await queryRunner.hasTable("project");
    if (!hasProjectTable) return;

    const hasIntroduction = await queryRunner.hasColumn("project", "introduction");
    const hasRules = await queryRunner.hasColumn("project", "rules");
    const hasTechStack = await queryRunner.hasColumn("project", "techStack");
    const columns: string[] = [];

    if (!hasIntroduction) {
      columns.push("ADD COLUMN `introduction` text NULL AFTER `actionColor`");
    }
    if (!hasRules) {
      columns.push("ADD COLUMN `rules` text NULL AFTER `introduction`");
    }
    if (!hasTechStack) {
      columns.push("ADD COLUMN `techStack` text NULL AFTER `rules`");
    }

    if (columns.length > 0) {
      await queryRunner.query(`ALTER TABLE \`project\` ${columns.join(", ")}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasProjectTable = await queryRunner.hasTable("project");
    if (!hasProjectTable) return;

    const hasTechStack = await queryRunner.hasColumn("project", "techStack");
    const hasRules = await queryRunner.hasColumn("project", "rules");
    const hasIntroduction = await queryRunner.hasColumn("project", "introduction");
    const columns: string[] = [];

    if (hasTechStack) columns.push("DROP COLUMN `techStack`");
    if (hasRules) columns.push("DROP COLUMN `rules`");
    if (hasIntroduction) columns.push("DROP COLUMN `introduction`");

    if (columns.length > 0) {
      await queryRunner.query(`ALTER TABLE \`project\` ${columns.join(", ")}`);
    }
  }
}
