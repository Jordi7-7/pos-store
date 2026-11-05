import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AppException } from '../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { ProductVariant } from '../../domain/entities/product-variant.entity';
import { Product } from '../../domain/entities/product.entity';
import { ProductType } from '../../domain/enums/product-type.enum';

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

  const taken = (await query.getExists()) || (await variantUsesSku(manager, tenantId, baseSku, exceptProductId));
  if (taken) {
    throw new AppException(ErrorCode.BaseSkuTaken, `El SKU base "${baseSku.trim().toUpperCase()}" ya lo usa otro producto.`, HttpStatus.CONFLICT, { baseSku: baseSku.trim().toUpperCase() });
  }
}

/**
 * El POS busca primero por SKU de variante y solo después por SKU base: una familia cuyo SKU base
 * coincidiera con el SKU de una variante de otro producto quedaría inalcanzable al escanearla.
 */
async function variantUsesSku(manager: EntityManager, tenantId: string, sku: string, exceptProductId?: string): Promise<boolean> {
  const query = manager
    .getRepository(ProductVariant)
    .createQueryBuilder('variant')
    .where('variant.tenantId = :tenantId', { tenantId })
    .andWhere('UPPER(variant.sku) = UPPER(:sku)', { sku: sku.trim() });
  if (exceptProductId) {
    query.andWhere('variant.productId <> :exceptProductId', { exceptProductId });
  }
  return query.getExists();
}

/**
 * Lo inverso: el SKU de una variante no puede coincidir con el SKU base de otra familia de variantes,
 * o escanear esa familia devolvería la variante y no la familia.
 */
export async function assertSkusDoNotShadowBaseSku(manager: EntityManager, tenantId: string, skus: readonly string[], exceptProductId?: string): Promise<void> {
  const upperSkus = skus.map((sku) => sku.trim().toUpperCase()).filter((sku) => sku !== '');
  if (upperSkus.length === 0) return;

  const query = manager
    .getRepository(Product)
    .createQueryBuilder('product')
    .select('product.baseSku', 'baseSku')
    .where('product.tenantId = :tenantId', { tenantId })
    .andWhere('product.type = :type', { type: ProductType.VARIABLE })
    .andWhere('UPPER(product.baseSku) IN (:...upperSkus)', { upperSkus });
  if (exceptProductId) {
    query.andWhere('product.id <> :exceptProductId', { exceptProductId });
  }

  const clash = await query.getRawOne<{ baseSku: string }>();
  if (clash) {
    throw new AppException(
      ErrorCode.SkuTaken,
      `El SKU "${clash.baseSku}" coincide con el SKU base de otro producto.`,
      HttpStatus.CONFLICT,
      { sku: clash.baseSku },
    );
  }
}
