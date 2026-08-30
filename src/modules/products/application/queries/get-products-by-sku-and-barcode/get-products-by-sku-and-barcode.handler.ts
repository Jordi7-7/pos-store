import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetProductsBySkuAndBarcodeQuery } from './get-products-by-sku-and-barcode.query';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';

@QueryHandler(GetProductsBySkuAndBarcodeQuery)
export class GetProductsBySkuAndBarcodeHandler implements IQueryHandler<GetProductsBySkuAndBarcodeQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProductsBySkuAndBarcodeQuery): Promise<any> {
    const { tenantId, code, page = 1, limit = 10 } = query;
    const repo = this.entityManager.getRepository(ProductVariant);
    const searchCode = `%${code.trim()}%`;
    const take = limit;
    const skip = (page - 1) * limit;

    const [variants, total] = await repo.createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.images', 'variantImages')
      .leftJoinAndSelect('variant.stocks', 'stocks')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .leftJoinAndSelect('attributeValues.attribute', 'attribute')
      .leftJoinAndSelect('variant.tags', 'tags')
      .where('variant.tenantId = :tenantId', { tenantId })
      .andWhere('(variant.sku LIKE :searchCode OR variant.barcode LIKE :searchCode)', { searchCode })
      .orderBy('variant.sku', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    const data = variants.map(variant => ({
      id: variant.product.id,
      name: variant.product.name,
      description: variant.product.description,
      imageIds: variant.images ? variant.images.map(img => img.id) : [],
      variants: [
        {
          id: variant.id,
          sku: variant.sku,
          barcode: variant.barcode,
          purchasePrice: Number(variant.purchasePrice),
          salePrice: Number(variant.salePrice),
          stocks: variant.stocks,
          attributeValues: variant.attributeValues,
          tags: variant.tags,
          imageIds: variant.images ? variant.images.map(img => img.id) : [],
        }
      ]
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    };
  }
}
