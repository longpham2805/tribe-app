import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDisabledToSlot1777690000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const hasDisabled = await queryRunner.hasColumn("slot", "disabled");
    if (!hasDisabled) {
      await queryRunner.query("ALTER TABLE `slot` ADD `disabled` tinyint NOT NULL DEFAULT 0");
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const hasDisabled = await queryRunner.hasColumn("slot", "disabled");
    if (hasDisabled) {
      await queryRunner.query("ALTER TABLE `slot` DROP COLUMN `disabled`");
    }
  }
}
