import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAppState1746700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasAppStateTable = await queryRunner.hasTable("app_state");
    if (!hasAppStateTable) {
      await queryRunner.query(`
        CREATE TABLE \`app_state\` (
          \`id\` int NOT NULL,
          \`autoTriggerEnabled\` tinyint(1) NOT NULL DEFAULT 1,
          \`availableCliTypes\` json NOT NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB
      `);
    }

    await queryRunner.query(`
      INSERT INTO \`app_state\` (\`id\`, \`autoTriggerEnabled\`, \`availableCliTypes\`)
      VALUES (1, 1, JSON_ARRAY('CLAUDE', 'CODEX'))
      ON DUPLICATE KEY UPDATE \`id\` = \`id\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasAppStateTable = await queryRunner.hasTable("app_state");
    if (hasAppStateTable) {
      await queryRunner.query("DROP TABLE `app_state`");
    }
  }
}
