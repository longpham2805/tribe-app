import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectIdToTicketAndSlot1746100100000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`ticket\` ADD COLUMN \`projectId\` int NULL`);
    await queryRunner.query(`ALTER TABLE \`slot\` ADD COLUMN \`projectId\` int NULL`);

    await queryRunner.query(`
      ALTER TABLE \`ticket\`
        ADD CONSTRAINT \`FK_ticket_project\`
        FOREIGN KEY (\`projectId\`) REFERENCES \`project\`(\`id\`) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`slot\`
        ADD CONSTRAINT \`FK_slot_project\`
        FOREIGN KEY (\`projectId\`) REFERENCES \`project\`(\`id\`) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`ticket\` DROP FOREIGN KEY \`FK_ticket_project\``);
    await queryRunner.query(`ALTER TABLE \`slot\` DROP FOREIGN KEY \`FK_slot_project\``);
    await queryRunner.query(`ALTER TABLE \`ticket\` DROP COLUMN \`projectId\``);
    await queryRunner.query(`ALTER TABLE \`slot\` DROP COLUMN \`projectId\``);
  }
}
