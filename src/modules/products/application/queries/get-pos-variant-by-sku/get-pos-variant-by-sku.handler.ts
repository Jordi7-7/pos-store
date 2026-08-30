import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetPosVariantBySkuQuery } from './get-pos-variant-by-sku.query';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';

@QueryHandler(GetPosVariantBySkuQuery)
export class GetPosVariantBySkuHandler implements IQueryHandler<GetPosVariantBySkuQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPosVariantBySkuQuery): Promise<any[]> {
    const { tenantId, sku, branchId } = query;
    const repo = this.entityManager.getRepository(ProductVariant);
    const searchString = sku.trim();

    const variants = await repo.createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValue')
      .leftJoinAndSelect('attributeValue.attribute', 'attribute')
      .leftJoinAndSelect('variant.stocks', 'stock', 'stock.branchId = :branchId', { branchId })
      .where('variant.tenantId = :tenantId', { tenantId })
      .andWhere(
        '(variant.sku = :searchString OR variant.barcode = :searchString)',
        { searchString }
      )
      .getMany();

    return variants.map(variant => {
      const branchStock = variant.stocks ? variant.stocks.find(s => s.branchId === branchId) : null;
      const stockQuantity = branchStock ? Number(branchStock.quantity) : 0;

      return {
        id: variant.id,
        sku: variant.sku,
        barcode: variant.barcode,
        purchasePrice: variant.purchasePrice,
        salePrice: variant.salePrice,
        productName: variant.product.name,
        stock: stockQuantity,
        attributeValues: variant.attributeValues || [],
      };
    });
  }
}
