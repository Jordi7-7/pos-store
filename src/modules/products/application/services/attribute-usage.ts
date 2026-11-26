import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../common/errors/error-codes';

/**
 * Lanza ATTRIBUTE_IN_USE si alguna variante vigente de la tienda usa alguno de esos valores de atributo. Las variantes eliminadas
 * no cuentan (el producto ya no existe para el catálogo), así que sus atributos de prueba se pueden limpiar.
 */
export async function assertAttributeValuesUnused(manager: EntityManager, tenantId: string, valueIds: readonly string[], what: string): Promise<void> {
  if (valueIds.length === 0) return;
  const rows: Array<{ variants: string }> = await manager.query(
    `SELECT COUNT(DISTINCT v."id") AS variants
       FROM "variant_attribute_values" vav
       INNER JOIN "product_variants" v ON v."id" = vav."variant_id" AND v."deleted_at" IS NULL
      WHERE v."tenant_id" = $1 AND vav."attribute_value_id" = ANY($2::uuid[])`,
    [tenantId, [...valueIds]],
  );
  const variants = Number(rows[0]?.variants ?? 0);
  if (variants > 0) {
    throw new AppException(ErrorCode.AttributeInUse, `${what} lo usan ${variants} variante(s) de productos; quítalo de ellas antes de eliminarlo.`, HttpStatus.CONFLICT, { variants });
  }
}
