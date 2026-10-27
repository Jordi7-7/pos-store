import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeEmailAndPhoneOptionalInCustomers1792700100000 implements MigrationInterface {
  name = 'MakeEmailAndPhoneOptionalInCustomers1792700100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "email" DROP NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "phone" DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "customers"
      SET "email" = ''
      WHERE "email" IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "email" SET NOT NULL;
    `);

    await queryRunner.query(`
      UPDATE "customers"
      SET "phone" = ''
      WHERE "phone" IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE "customers"
      ALTER COLUMN "phone" SET NOT NULL;
    `);
  }
}
