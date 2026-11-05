import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El documento del cliente es único entre los clientes activos: un cliente borrado (soft delete)
 * no debe impedir volver a registrar el mismo documento. Una migración autogenerada anterior había
 * dejado el índice sin filtro.
 */
export class MakeCustomerIdentityUniqueAmongActive1793200000000 implements MigrationInterface {
  name = 'MakeCustomerIdentityUniqueAmongActive1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_d851ed7b267740601149d6a6bf"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_customers_tenant_identity"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_customers_tenant_identity" ON "customers" ("tenant_id", "identity_number") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_customers_tenant_identity"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d851ed7b267740601149d6a6bf" ON "customers" ("tenant_id", "identity_number")`);
  }
}
