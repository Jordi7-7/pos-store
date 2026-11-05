import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { Product } from '../../domain/entities/product.entity';

/**
 * El SKU base identifica al producto (en uno simple es el SKU de su única variante; en uno con
 * variantes, el prefijo de la familia) y es único por tienda sin distinguir mayúsculas. La base de
 * datos lo garantiza con un índice; esta comprobación previa da el error preciso en el caso común.
 */
export async function assertBaseSkuAvailable(manager: EntityManager, tenantId: string, baseSku: string, exceptProductId?: string): Promise<void> {
  const query = manager
    .getRepository(Product)
    .createQueryBuilder('product')
    .where('product.tenantId = :tenantId', { tenantId })
    .andWhere('UPPER(product.baseSku) = UPPER(:baseSku)', { baseSku: baseSku.trim() });
  if (exceptProductId) {
    query.andWhere('product.id <> :exceptProductId', { exceptProductId });
  }

  if (await query.getExists()) {
    throw new AppException(ErrorCode.BaseSkuTaken, `El SKU base "${baseSku.trim().toUpperCase()}" ya lo usa otro producto.`, HttpStatus.CONFLICT, { baseSku: baseSku.trim().toUpperCase() });
  }
}
