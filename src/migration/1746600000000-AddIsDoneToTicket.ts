import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsDoneToTicket1746600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTicketTable = await queryRunner.hasTable("ticket");
    if (!hasTicketTable) return;

    const hasIsDone = await queryRunner.hasColumn("ticket", "isDone");
    if (!hasIsDone) {
      await queryRunner.query(
        "ALTER TABLE `ticket` ADD COLUMN `isDone` tinyint(1) NOT NULL DEFAULT 0",
      );
      await queryRunner.query(`
        UPDATE \`ticket\` t
        SET t.\`isDone\` = 1
        WHERE EXISTS (
          SELECT 1 FROM \`phase\` p
          WHERE p.\`ticket_id\` = t.\`id\`
            AND p.\`phaseName\` = 'SHIP'
            AND p.\`status\` = 'COMPLETED'
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTicketTable = await queryRunner.hasTable("ticket");
    if (!hasTicketTable) return;

    const hasIsDone = await queryRunner.hasColumn("ticket", "isDone");
    if (hasIsDone) {
      await queryRunner.query("ALTER TABLE `ticket` DROP COLUMN `isDone`");
    }
  }
}
