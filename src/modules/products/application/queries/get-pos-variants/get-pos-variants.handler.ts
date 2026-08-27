import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetPosVariantsQuery } from './get-pos-variants.query';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';

@QueryHandler(GetPosVariantsQuery)
export class GetPosVariantsHandler implements IQueryHandler<GetPosVariantsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPosVariantsQuery): Promise<any[]> {
    const { tenantId, branchId } = query;
    const repo = this.entityManager.getRepository(ProductVariant);

    const variants = await repo.createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValue')
      .leftJoinAndSelect('attributeValue.attribute', 'attribute')
      .leftJoinAndSelect('variant.stocks', 'stock', 'stock.branchId = :branchId', { branchId })
      .where('variant.tenantId = :tenantId', { tenantId })
      .getMany();

    return variants.map(variant => {
      const branchStock = variant.stocks ? variant.stocks.find(s => s.branchId === branchId) : null;
      const stockQuantity = branchStock ? Number(branchStock.quantity) : 0;

      return {
        id: variant.id,
        sku: variant.sku,
        purchasePrice: variant.purchasePrice,
        salePrice: variant.salePrice,
        productName: variant.product.name,
        stock: stockQuantity,
        attributeValues: variant.attributeValues || [],
      };
    });
  }
}
