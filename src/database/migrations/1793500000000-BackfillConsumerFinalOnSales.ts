import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Toda venta tiene comprador: las que se guardaron sin cliente pasan al CONSUMIDOR FINAL de su tienda
 * (documento 9999999999999), que se crea si la tienda no lo tiene. Es lo que ya mostraban las pantallas
 * para esas ventas, así que no cambia lo que ve el usuario.
 */
export class BackfillConsumerFinalOnSales1793500000000 implements MigrationInterface {
  name = 'BackfillConsumerFinalOnSales1793500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "customers" ("tenant_id", "identity_number", "name", "email", "phone")
      SELECT t."id", '9999999999999', 'CONSUMIDOR FINAL', 'consumidorfinal@example.com', '9999999999'
      FROM "tenants" t
      WHERE EXISTS (SELECT 1 FROM "sales" s WHERE s."tenant_id" = t."id" AND s."customer_id" IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM "customers" c
          WHERE c."tenant_id" = t."id" AND c."identity_number" = '9999999999999' AND c."deleted_at" IS NULL
        )
    `);
    await queryRunner.query(`
      UPDATE "sales" s
      SET "customer_id" = c."id"
      FROM "customers" c
      WHERE s."customer_id" IS NULL
        AND c."tenant_id" = s."tenant_id"
        AND c."identity_number" = '9999999999999'
        AND c."deleted_at" IS NULL
    `);
  }

  public async down(): Promise<void> {
    // Las ventas ya apuntan a un comprador válido: no hay forma ni motivo de volver a dejarlas sin cliente.
  }
}
