import { MigrationInterface, QueryRunner } from "typeorm";

export class AddShipFieldsToTicket1746050000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTicketTable = await queryRunner.hasTable("ticket");
    if (!hasTicketTable) return;

    const hasBranchName = await queryRunner.hasColumn("ticket", "branchName");
    if (!hasBranchName) {
      await queryRunner.query(
        "ALTER TABLE `ticket` ADD COLUMN `branchName` varchar(255) NULL AFTER `mondayMarkdown`",
      );
    }

    const hasPullRequests = await queryRunner.hasColumn("ticket", "pullRequests");
    if (!hasPullRequests) {
      await queryRunner.query(
        "ALTER TABLE `ticket` ADD COLUMN `pullRequests` JSON NULL AFTER `branchName`",
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTicketTable = await queryRunner.hasTable("ticket");
    if (!hasTicketTable) return;

    const hasPullRequests = await queryRunner.hasColumn("ticket", "pullRequests");
    if (hasPullRequests) {
      await queryRunner.query("ALTER TABLE `ticket` DROP COLUMN `pullRequests`");
    }

    const hasBranchName = await queryRunner.hasColumn("ticket", "branchName");
    if (hasBranchName) {
      await queryRunner.query("ALTER TABLE `ticket` DROP COLUMN `branchName`");
    }
  }
}
