import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMondayFieldsToTicket1713700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTicketTable = await queryRunner.hasTable("ticket");
    if (!hasTicketTable) {
      await queryRunner.query(
        `CREATE TABLE \`ticket\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`title\` varchar(255) NOT NULL,
          \`description\` text NULL,
          \`mondayItemId\` varchar(50) NULL,
          \`currentPhase\` enum('CREATED','BRAINSTORM','PLANNING','IMPLEMENTATION','SHIP') NOT NULL DEFAULT 'CREATED',
          \`mondayMarkdown\` mediumtext NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          UNIQUE INDEX \`UQ_ticket_mondayItemId\` (\`mondayItemId\`),
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB`
      );
    } else {
      const hasMondayItemId = await queryRunner.hasColumn("ticket", "mondayItemId");
      if (!hasMondayItemId) {
        await queryRunner.query(
          "ALTER TABLE `ticket` ADD COLUMN `mondayItemId` VARCHAR(50) NULL"
        );
      }

      const hasMondayMarkdown = await queryRunner.hasColumn("ticket", "mondayMarkdown");
      if (!hasMondayMarkdown) {
        await queryRunner.query(
          "ALTER TABLE `ticket` ADD COLUMN `mondayMarkdown` MEDIUMTEXT NULL"
        );
      }

      const ticketTable = await queryRunner.getTable("ticket");
      const hasMondayItemIdUniqueIndex =
        ticketTable?.indices.some((index) => {
          const names = index.columnNames;
          return (
            index.isUnique &&
            names.length === 1 &&
            names[0] === "mondayItemId"
          );
        }) ?? false;

      if (!hasMondayItemIdUniqueIndex) {
        await queryRunner.query(
          "ALTER TABLE `ticket` ADD UNIQUE INDEX `UQ_ticket_mondayItemId` (`mondayItemId`)"
        );
      }
    }

    const hasPhaseTable = await queryRunner.hasTable("phase");
    if (!hasPhaseTable) {
      await queryRunner.query(
        `CREATE TABLE \`phase\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`ticket_id\` int NOT NULL,
          \`phaseName\` enum('CREATED','BRAINSTORM','PLANNING','IMPLEMENTATION','SHIP') NOT NULL,
          \`startedAt\` datetime NOT NULL,
          \`completedAt\` datetime NULL,
          \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          INDEX \`IDX_phase_ticket_id\` (\`ticket_id\`),
          CONSTRAINT \`FK_phase_ticket_id\` FOREIGN KEY (\`ticket_id\`) REFERENCES \`ticket\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION
        ) ENGINE=InnoDB`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasPhaseTable = await queryRunner.hasTable("phase");
    if (hasPhaseTable) {
      await queryRunner.query("DROP TABLE `phase`");
    }

    const hasTicketTable = await queryRunner.hasTable("ticket");
    if (hasTicketTable) {
      await queryRunner.query("DROP TABLE `ticket`");
    }
  }
}
