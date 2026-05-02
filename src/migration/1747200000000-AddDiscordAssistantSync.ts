import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDiscordAssistantSync1747200000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`discord_assistant_sync\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`entityType\` varchar(32) NOT NULL,
        \`entityId\` int NOT NULL,
        \`discordChannelId\` varchar(64) NOT NULL,
        \`discordMessageId\` varchar(64) NOT NULL,
        \`direction\` varchar(32) NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_discord_assistant_sync_entity_direction\` (\`entityType\`, \`entityId\`, \`discordChannelId\`, \`direction\`),
        UNIQUE KEY \`UQ_discord_assistant_sync_discord_message\` (\`discordMessageId\`)
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`discord_assistant_sync\``);
  }
}
