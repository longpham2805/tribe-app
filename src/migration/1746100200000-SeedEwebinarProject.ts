import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedEwebinarProject1746100200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const boardIdsRaw = process.env.MONDAY_DEFAULT_BOARD_IDS ?? "";
    const boardIds = boardIdsRaw
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    const defaultPersonId = process.env.EWEBINAR_DEFAULT_PERSON_ID?.trim() ?? null;

    const devPeopleRaw = process.env.EWEBINAR_DEV_PEOPLE ?? "";
    const devPeople = devPeopleRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    await queryRunner.query(
      `INSERT INTO \`project\` (name, slug, mondayBoardIds, mondayDefaultPersonId, mondayDevPeople)
       VALUES (?, ?, ?, ?, ?)`,
      [
        "eWebinar",
        "ewebinar",
        JSON.stringify(boardIds.length ? boardIds : null),
        defaultPersonId,
        JSON.stringify(devPeople.length ? devPeople : null),
      ],
    );

    const rows: any[] = await queryRunner.query(
      `SELECT id FROM \`project\` WHERE slug = 'ewebinar' LIMIT 1`,
    );
    const ewebinarId: number = rows[0].id;

    await queryRunner.query(
      `UPDATE \`ticket\` SET projectId = ? WHERE projectId IS NULL`,
      [ewebinarId],
    );
    await queryRunner.query(
      `UPDATE \`slot\` SET projectId = ? WHERE projectId IS NULL`,
      [ewebinarId],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE \`ticket\` SET projectId = NULL`);
    await queryRunner.query(`UPDATE \`slot\` SET projectId = NULL`);
    await queryRunner.query(`DELETE FROM \`project\` WHERE slug = 'ewebinar'`);
  }
}
