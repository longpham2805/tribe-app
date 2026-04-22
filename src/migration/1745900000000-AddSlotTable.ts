import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlotTable1745900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create slot table
    await queryRunner.query(`
      CREATE TABLE \`slot\` (
        \`id\`              int           NOT NULL AUTO_INCREMENT,
        \`name\`            varchar(100)  NOT NULL,
        \`backendPath\`     varchar(500)  NOT NULL,
        \`frontendPath\`    varchar(500)  NOT NULL,
        \`currentTicketId\` int           NULL,
        \`createdAt\`       datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\`       datetime(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 2. Add slotId and waitingForSlot to ticket
    await queryRunner.query(
      `ALTER TABLE \`ticket\` ADD \`slotId\` int NULL`
    );
    await queryRunner.query(
      `ALTER TABLE \`ticket\` ADD \`waitingForSlot\` tinyint NOT NULL DEFAULT 0`
    );

    // 3. Foreign key: ticket.slotId → slot.id (SET NULL on slot delete)
    await queryRunner.query(
      `ALTER TABLE \`ticket\`
       ADD CONSTRAINT \`FK_ticket_slot\`
       FOREIGN KEY (\`slotId\`) REFERENCES \`slot\`(\`id\`)
       ON DELETE SET NULL`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ticket\` DROP FOREIGN KEY \`FK_ticket_slot\``
    );
    await queryRunner.query(
      `ALTER TABLE \`ticket\` DROP COLUMN \`waitingForSlot\``
    );
    await queryRunner.query(
      `ALTER TABLE \`ticket\` DROP COLUMN \`slotId\``
    );
    await queryRunner.query(`DROP TABLE \`slot\``);
  }
}
