import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMondayBoardIdToTicket1746000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTicketTable = await queryRunner.hasTable("ticket");
    if (!hasTicketTable) return;

    const hasMondayBoardId = await queryRunner.hasColumn("ticket", "mondayBoardId");
    if (!hasMondayBoardId) {
      await queryRunner.query(
        "ALTER TABLE `ticket` ADD COLUMN `mondayBoardId` INT NULL AFTER `mondayItemId`",
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTicketTable = await queryRunner.hasTable("ticket");
    if (!hasTicketTable) return;

    const hasMondayBoardId = await queryRunner.hasColumn("ticket", "mondayBoardId");
    if (hasMondayBoardId) {
      await queryRunner.query("ALTER TABLE `ticket` DROP COLUMN `mondayBoardId`");
    }
  }
}
