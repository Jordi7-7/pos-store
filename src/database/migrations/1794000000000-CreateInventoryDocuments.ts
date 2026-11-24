import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Documentos de inventario y kardex completo.
 *
 * - Una entrada, salida, conteo o traslado manual con varias líneas se guarda como una cabecera (`inventory_documents`: número,
 *   motivo, comentario, usuario, sucursal origen y destino) y sus movimientos del kardex apuntan a ella (`document_id`).
 *   `inventory_document_counters` lleva el siguiente número por tienda y tipo (ENT, SAL, CNT, TRS).
 * - Cada línea del kardex gana `category` (la clase de operación, la única clasificación para filtrar), `unit_cost` (el costo
 *   unitario con el que se movió) y `balance_after` (la existencia justo después del movimiento).
 *
 * Todo es aditivo y compatible hacia atrás: las columnas nuevas admiten nulo, así que una versión anterior de la API que siga
 * escribiendo movimientos sin ellas no falla (esas filas quedan con `category` nula y la conciliación las señala). Solo `category`
 * se rellena para lo que ya existe, a partir del motivo; el costo y el saldo de las filas anteriores no se pueden reconstruir
 * con exactitud y quedan en nulo.
 */
export class CreateInventoryDocuments1794000000000 implements MigrationInterface {
  name = 'CreateInventoryDocuments1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inventory_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "branch_id" uuid NOT NULL,
        "destination_branch_id" uuid,
        "user_id" uuid,
        "kind" varchar(20) NOT NULL,
        "number" varchar(30) NOT NULL,
        "reason" varchar(50) NOT NULL,
        "comment" text,
        "client_request_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_inventory_documents_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_documents_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_inventory_documents_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id"),
        CONSTRAINT "FK_inventory_documents_destination_branch" FOREIGN KEY ("destination_branch_id") REFERENCES "branches"("id"),
        CONSTRAINT "FK_inventory_documents_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_inventory_documents_tenant_number" ON "inventory_documents" ("tenant_id", "number")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_inventory_documents_tenant_client_request" ON "inventory_documents" ("tenant_id", "client_request_id") WHERE "client_request_id" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_inventory_documents_tenant_created" ON "inventory_documents" ("tenant_id", "created_at" DESC)`);

    // Siguiente número por tienda y tipo de documento (ENT, SAL…); se incrementa con un solo UPSERT atómico
    await queryRunner.query(`
      CREATE TABLE "inventory_document_counters" (
        "tenant_id" uuid NOT NULL,
        "prefix" varchar(10) NOT NULL,
        "last_number" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_inventory_document_counters" PRIMARY KEY ("tenant_id", "prefix"),
        CONSTRAINT "FK_inventory_document_counters_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`ALTER TABLE "inventory_movements" ADD COLUMN "document_id" uuid`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" ADD CONSTRAINT "FK_inventory_movements_document" FOREIGN KEY ("document_id") REFERENCES "inventory_documents"("id")`);
    await queryRunner.query(`CREATE INDEX "IDX_inventory_movements_document" ON "inventory_movements" ("document_id") WHERE "document_id" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" ADD COLUMN "category" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" ADD COLUMN "unit_cost" numeric(12,4)`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" ADD COLUMN "balance_after" numeric(10,2)`);

    // Lo que ya existe se clasifica a partir de su motivo (en producción solo hay los seis motivos originales)
    await queryRunner.query(`
      UPDATE "inventory_movements" SET "category" = CASE "reason"
        WHEN 'INITIAL_STOCK' THEN 'INITIAL'
        WHEN 'COMPRA' THEN 'PURCHASE'
        WHEN 'ANULACION_COMPRA' THEN 'PURCHASE'
        WHEN 'VENTA' THEN 'SALE'
        WHEN 'DEVOLUCION' THEN 'RETURN'
        WHEN 'CONTEO_FISICO' THEN 'COUNT'
        WHEN 'TRASLADO' THEN 'TRANSFER'
        WHEN 'ADJUSTMENT' THEN 'ADJUSTMENT'
        WHEN 'DONACION' THEN 'ADJUSTMENT'
        WHEN 'PRODUCCION' THEN 'ADJUSTMENT'
        WHEN 'MERMA' THEN 'ADJUSTMENT'
        WHEN 'PERDIDA' THEN 'ADJUSTMENT'
        WHEN 'USO_INTERNO' THEN 'ADJUSTMENT'
        WHEN 'DEVOLUCION_PROVEEDOR' THEN 'ADJUSTMENT'
        WHEN 'OTRO' THEN 'ADJUSTMENT'
      END
    `);

    await queryRunner.query(`ALTER TABLE "batches" ADD COLUMN "document_id" uuid`);
    await queryRunner.query(`ALTER TABLE "batches" ADD CONSTRAINT "FK_batches_document" FOREIGN KEY ("document_id") REFERENCES "inventory_documents"("id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "batches" DROP CONSTRAINT IF EXISTS "FK_batches_document"`);
    await queryRunner.query(`ALTER TABLE "batches" DROP COLUMN IF EXISTS "document_id"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "balance_after"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "unit_cost"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_movements_document"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "FK_inventory_movements_document"`);
    await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN IF EXISTS "document_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_document_counters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_documents"`);
  }
}
