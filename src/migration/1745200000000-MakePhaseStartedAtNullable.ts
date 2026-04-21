import { MigrationInterface, QueryRunner } from "typeorm";

export class MakePhaseStartedAtNullable1745200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `phase` MODIFY COLUMN `startedAt` datetime NULL"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE `phase` SET `startedAt` = NOW() WHERE `startedAt` IS NULL"
    );
    await queryRunner.query(
      "ALTER TABLE `phase` MODIFY COLUMN `startedAt` datetime NOT NULL"
    );
  }
}
