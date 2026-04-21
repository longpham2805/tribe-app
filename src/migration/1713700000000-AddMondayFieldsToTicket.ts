import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMondayFieldsToTicket1713700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ticket\`
       ADD COLUMN \`mondayItemId\` VARCHAR(50) NULL,
       ADD COLUMN \`mondayMarkdown\` MEDIUMTEXT NULL`
    );

    await queryRunner.query(
      `ALTER TABLE \`ticket\`
       ADD UNIQUE INDEX \`UQ_ticket_mondayItemId\` (\`mondayItemId\`)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ticket\` DROP INDEX \`UQ_ticket_mondayItemId\``
    );

    await queryRunner.query(
      `ALTER TABLE \`ticket\`
       DROP COLUMN \`mondayMarkdown\`,
       DROP COLUMN \`mondayItemId\``
    );
  }
}
