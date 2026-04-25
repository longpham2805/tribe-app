import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProjectColors1746500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`project\`
      ADD COLUMN \`primaryColor\` varchar(7) NULL AFTER \`mondayDevPeople\`,
      ADD COLUMN \`actionColor\` varchar(7) NULL AFTER \`primaryColor\`
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`project\`
      DROP COLUMN \`actionColor\`,
      DROP COLUMN \`primaryColor\`
    `);
  }
}
