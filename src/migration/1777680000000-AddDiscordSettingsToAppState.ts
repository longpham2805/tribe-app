import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDiscordSettingsToAppState1777680000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const hasAppStateTable = await queryRunner.hasTable("app_state");
    if (!hasAppStateTable) return;

    const hasDiscordBotToken = await queryRunner.hasColumn("app_state", "discordBotToken");
    if (!hasDiscordBotToken) {
      await queryRunner.query("ALTER TABLE `app_state` ADD `discordBotToken` varchar(255) NULL");
    }

    const hasDiscordAssistantThreadId = await queryRunner.hasColumn("app_state", "discordAssistantThreadId");
    if (!hasDiscordAssistantThreadId) {
      await queryRunner.query("ALTER TABLE `app_state` ADD `discordAssistantThreadId` varchar(64) NULL");
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const hasAppStateTable = await queryRunner.hasTable("app_state");
    if (!hasAppStateTable) return;

    const hasDiscordAssistantThreadId = await queryRunner.hasColumn("app_state", "discordAssistantThreadId");
    if (hasDiscordAssistantThreadId) {
      await queryRunner.query("ALTER TABLE `app_state` DROP COLUMN `discordAssistantThreadId`");
    }

    const hasDiscordBotToken = await queryRunner.hasColumn("app_state", "discordBotToken");
    if (hasDiscordBotToken) {
      await queryRunner.query("ALTER TABLE `app_state` DROP COLUMN `discordBotToken`");
    }
  }
}
