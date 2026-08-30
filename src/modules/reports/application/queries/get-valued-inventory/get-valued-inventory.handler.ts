import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetValuedInventoryQuery } from './get-valued-inventory.query';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { PurchaseOrderItem } from '../../../../purchases/domain/entities/purchase-order-item.entity';

@QueryHandler(GetValuedInventoryQuery)
export class GetValuedInventoryHandler implements IQueryHandler<GetValuedInventoryQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetValuedInventoryQuery) {
    const { tenantId, page, limit } = query;

    // 1. Fetch latest purchase order item price for each variant of this tenant
    const latestPurchases = await this.entityManager
      .createQueryBuilder(PurchaseOrderItem, 'poi')
      .innerJoin('poi.purchaseOrder', 'po')
      .select('poi.variantId', 'variantId')
      .addSelect('poi.purchasePrice', 'purchasePrice')
      .distinctOn(['poi.variantId'])
      .where('po.tenantId = :tenantId', { tenantId })
      .orderBy('poi.variantId')
      .addOrderBy('po.createdAt', 'DESC')
      .getRawMany();

    const priceMap = new Map<string, number>();
    for (const row of latestPurchases) {
      priceMap.set(row.variantId, Number(row.purchasePrice || 0));
    }

    // 2. Build QueryBuilder on ProductVariant to filter stock !== 0 and apply pagination
    const variantRepository = this.entityManager.getRepository(ProductVariant);
    const queryBuilder = variantRepository.createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.stocks', 'stocks')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .where('variant.tenantId = :tenantId', { tenantId })
      .andWhere(
        `COALESCE((SELECT SUM(quantity) FROM product_stocks WHERE variant_id = variant.id), 0) <> 0`
      )
      .orderBy('variant.sku', 'ASC');

    if (page && limit) {
      const take = limit;
      const skip = (page - 1) * limit;
      queryBuilder.skip(skip).take(take);
    }

    // 3. Compute global totalQuantity and totalValue across all non-zero stock variants
    const allVariants = await variantRepository.createQueryBuilder('variant')
      .leftJoinAndSelect('variant.stocks', 'stocks')
      .where('variant.tenantId = :tenantId', { tenantId })
      .andWhere(
        `COALESCE((SELECT SUM(quantity) FROM product_stocks WHERE variant_id = variant.id), 0) <> 0`
      )
      .getMany();

    let globalTotalQuantity = 0;
    let globalTotalValue = 0;

    for (const v of allVariants) {
      const qty = (v.stocks || []).reduce((sum, s) => sum + Number(s.quantity || 0), 0);
      const purchasePrice = priceMap.has(v.id) 
        ? priceMap.get(v.id)! 
        : Number(v.purchasePrice || 0);
      
      globalTotalQuantity += qty;
      globalTotalValue += qty * purchasePrice;
    }

    const [variants, total] = await queryBuilder.getManyAndCount();

    const data = variants.map((variant) => {
      const quantity = (variant.stocks || []).reduce((sum, s) => sum + Number(s.quantity || 0), 0);
      
      // Fallback: if no purchase order exists, use current variant purchasePrice from catalog
      const purchasePrice = priceMap.has(variant.id) 
        ? priceMap.get(variant.id)! 
        : Number(variant.purchasePrice || 0);

      const totalValue = quantity * purchasePrice;

      const attrsStr = (variant.attributeValues || [])
        .map((av) => av.value)
        .join(' / ');
      const name = attrsStr ? `${variant.product?.name} (${attrsStr})` : (variant.product?.name || '');

      return {
        sku: variant.sku,
        name,
        quantity,
        purchasePrice,
        totalValue,
      };
    });

    return {
      data,
      meta: {
        total,
        page: page || 1,
        limit: limit || total,
        totalPages: limit ? Math.ceil(total / limit) : 1,
        totalQuantity: globalTotalQuantity,
        totalValue: globalTotalValue,
      }
    };
  }
}
