import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssistantTables1746700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`assistant_session\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`claudeSessionId\` varchar(255) NULL,
        \`lastActiveAt\` datetime NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`assistant_message\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`role\` enum('user','assistant','system') NOT NULL DEFAULT 'assistant',
        \`content\` text NOT NULL,
        \`ticketId\` int NULL,
        \`phaseId\` int NULL,
        \`severity\` enum('info','warn','error') NOT NULL DEFAULT 'info',
        \`readAt\` datetime NULL,
        \`sourceEventKey\` varchar(500) NULL,
        \`metadata\` json NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_assistant_message_sourceEventKey\` (\`sourceEventKey\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`assistant_action\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`type\` enum('RETRY_PHASE','REBASE_AND_CONTINUE','RESPOND_TO_PHASE','TRIGGER_PHASE','OTHER') NOT NULL,
        \`status\` enum('proposed','approved','rejected','executed','failed') NOT NULL DEFAULT 'proposed',
        \`payload\` json NULL,
        \`reason\` text NULL,
        \`confidence\` float NULL,
        \`source\` enum('auto','chat','user') NOT NULL DEFAULT 'auto',
        \`fingerprint\` varchar(500) NULL,
        \`ticketId\` int NULL,
        \`messageId\` int NULL,
        \`errorMessage\` text NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_assistant_action_fingerprint\` (\`fingerprint\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(
      `ALTER TABLE \`app_state\` ADD \`assistantAutoActionsEnabled\` tinyint NOT NULL DEFAULT 1`
    );
    await queryRunner.query(
      `ALTER TABLE \`app_state\` ADD \`assistantModel\` varchar(100) NULL`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`app_state\` DROP COLUMN \`assistantModel\``);
    await queryRunner.query(`ALTER TABLE \`app_state\` DROP COLUMN \`assistantAutoActionsEnabled\``);
    await queryRunner.query(`DROP TABLE \`assistant_action\``);
    await queryRunner.query(`DROP TABLE \`assistant_message\``);
    await queryRunner.query(`DROP TABLE \`assistant_session\``);
  }
}
