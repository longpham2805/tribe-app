import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFeedbackPhase1746900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTicketTable = await queryRunner.hasTable("ticket");
    if (hasTicketTable) {
      await queryRunner.query(
        "ALTER TABLE `ticket` MODIFY `currentPhase` enum('CREATED','BRAINSTORM','PLANNING','IMPLEMENTATION','SHIP','FEEDBACK') NOT NULL DEFAULT 'CREATED'",
      );
    }

    const hasPhaseTable = await queryRunner.hasTable("phase");
    if (!hasPhaseTable) return;

    await queryRunner.query(
      "ALTER TABLE `phase` MODIFY `phaseName` enum('CREATED','BRAINSTORM','PLANNING','IMPLEMENTATION','SHIP','FEEDBACK') NOT NULL",
    );

    if (!(await queryRunner.hasColumn("phase", "sequence"))) {
      await queryRunner.query(
        "ALTER TABLE `phase` ADD COLUMN `sequence` int NOT NULL DEFAULT 0",
      );
    }

    if (!(await queryRunner.hasColumn("phase", "feedbackComment"))) {
      await queryRunner.query(
        "ALTER TABLE `phase` ADD COLUMN `feedbackComment` text NULL",
      );
    }

    if (!(await queryRunner.hasColumn("phase", "branchName"))) {
      await queryRunner.query(
        "ALTER TABLE `phase` ADD COLUMN `branchName` varchar(255) NULL",
      );
    }

    if (!(await queryRunner.hasColumn("phase", "pullRequests"))) {
      await queryRunner.query(
        "ALTER TABLE `phase` ADD COLUMN `pullRequests` json NULL",
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasPhaseTable = await queryRunner.hasTable("phase");
    if (hasPhaseTable) {
      if (await queryRunner.hasColumn("phase", "pullRequests")) {
        await queryRunner.query("ALTER TABLE `phase` DROP COLUMN `pullRequests`");
      }
      if (await queryRunner.hasColumn("phase", "branchName")) {
        await queryRunner.query("ALTER TABLE `phase` DROP COLUMN `branchName`");
      }
      if (await queryRunner.hasColumn("phase", "feedbackComment")) {
        await queryRunner.query("ALTER TABLE `phase` DROP COLUMN `feedbackComment`");
      }
      if (await queryRunner.hasColumn("phase", "sequence")) {
        await queryRunner.query("ALTER TABLE `phase` DROP COLUMN `sequence`");
      }

      await queryRunner.query(
        "ALTER TABLE `phase` MODIFY `phaseName` enum('CREATED','BRAINSTORM','PLANNING','IMPLEMENTATION','SHIP') NOT NULL",
      );
    }

    if (await queryRunner.hasTable("ticket")) {
      await queryRunner.query(
        "ALTER TABLE `ticket` MODIFY `currentPhase` enum('CREATED','BRAINSTORM','PLANNING','IMPLEMENTATION','SHIP') NOT NULL DEFAULT 'CREATED'",
      );
    }
  }
}
