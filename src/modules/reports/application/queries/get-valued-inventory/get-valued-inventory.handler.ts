import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetValuedInventoryQuery } from './get-valued-inventory.query';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { PurchaseOrderItem } from '../../../../purchases/domain/entities/purchase-order-item.entity';

@QueryHandler(GetValuedInventoryQuery)
export class GetValuedInventoryHandler implements IQueryHandler<GetValuedInventoryQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetValuedInventoryQuery) {
    const tenantId = query.tenantId;

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

    // 2. Fetch variants
    const variantRepository = this.entityManager.getRepository(ProductVariant);
    const variants = await variantRepository.find({
      where: { tenantId },
      relations: {
        product: true,
        stocks: true,
        attributeValues: true,
      },
      order: { sku: 'ASC' },
    });

    return variants.map((variant) => {
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
  }
}
