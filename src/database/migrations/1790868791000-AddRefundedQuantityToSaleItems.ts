import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefundedQuantityToSaleItems1790868791000 implements MigrationInterface {
  name = 'AddRefundedQuantityToSaleItems1790868791000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" ADD "refunded_quantity" numeric(10,2) NOT NULL DEFAULT 0`,
    );

    // Sync already refunded quantities from refund_items if there are previous refunds
    await queryRunner.query(`
      UPDATE "sale_items" si
      SET "refunded_quantity" = COALESCE(sub.total_refunded, 0)
      FROM (
        SELECT r.sale_id, ri.variant_id, SUM(ri.quantity) as total_refunded
        FROM "refund_items" ri
        JOIN "refunds" r ON r.id = ri.refund_id
        GROUP BY r.sale_id, ri.variant_id
      ) sub
      WHERE si.sale_id = sub.sale_id AND si.variant_id = sub.variant_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sale_items" DROP COLUMN "refunded_quantity"`,
    );
  }
}
