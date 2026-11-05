import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El correo y el usuario son únicos por tienda, no globalmente: la misma persona puede
 * administrar varias tiendas con el mismo correo. Una migración autogenerada anterior
 * (UpdateAllTimestampsToTimestamptz) volvió a crear una restricción única sobre `email` solo.
 */
export class ScopeUserEmailUniquenessToTenant1793100000000 implements MigrationInterface {
  name = 'ScopeUserEmailUniquenessToTenant1793100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_97672ac88f789774dd47f7c8be3"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_partial"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_tenant_email" ON "users" ("tenant_id", "email") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_tenant_username" ON "users" ("tenant_id", "username") WHERE "deleted_at" IS NULL AND "username" IS NOT NULL`,
    );
  }

  public async down(): Promise<void> {
    // Volver a la unicidad global podría fallar con datos válidos (mismo correo en dos tiendas): no se revierte.
  }
}
