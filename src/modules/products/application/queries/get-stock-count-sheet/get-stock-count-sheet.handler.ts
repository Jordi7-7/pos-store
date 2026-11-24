import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { StockCountSheetPage } from '../../read-models/stock-count-sheet';
import { GetStockCountSheetQuery } from './get-stock-count-sheet.query';

/**
 * Variantes del tenant con su existencia en una sucursal, ordenadas por SKU y paginadas por SKU (sin saltos ni repetidos
 * aunque cambie el catálogo mientras se recorre). Sirve para cargar los productos a contar sin escribirlos uno a uno.
 */
@QueryHandler(GetStockCountSheetQuery)
export class GetStockCountSheetHandler implements IQueryHandler<GetStockCountSheetQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetStockCountSheetQuery): Promise<StockCountSheetPage> {
    const { tenantId, userId, isOwner, branchId, filters } = query;
    await assertUserCanAccessBranch(this.entityManager, this.redisService, { userId, isOwner, branchId, actionDescription: 'consultar las existencias para un conteo' });

    const qb = this.entityManager
      .getRepository(ProductVariant)
      .createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .leftJoin('variant.stocks', 'stock', 'stock.branchId = :branchId', { branchId })
      .select(['variant.id', 'variant.sku', 'variant.purchasePrice', 'product.name', 'stock.quantity'])
      .where('variant.tenantId = :tenantId', { tenantId });

    if (filters.categoryId) qb.andWhere('product.categoryId = :categoryId', { categoryId: filters.categoryId });
    if (filters.onlyWithStock) qb.andWhere('COALESCE(stock.quantity, 0) <> 0');
    if (filters.after) qb.andWhere('variant.sku > :after', { after: filters.after });

    // Una fila de más para saber si hay página siguiente
    const rows = await qb.orderBy('variant.sku', 'ASC').take(filters.limit + 1).getMany();
    const page = rows.slice(0, filters.limit);

    return {
      items: page.map((variant) => ({
        variantId: variant.id,
        sku: variant.sku,
        productName: variant.product.name,
        stock: Number(variant.stocks?.[0]?.quantity ?? 0),
        purchasePrice: Number(variant.purchasePrice ?? 0),
      })),
      nextAfter: rows.length > filters.limit ? page[page.length - 1].sku : null,
    };
  }
}
