import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToExpenses1791223604514 implements MigrationInterface {
  name = 'AddUserIdToExpenses1791223604514';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "expenses" ADD "user_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_expenses_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_expenses_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "expenses" DROP COLUMN "user_id"`);
  }
}
