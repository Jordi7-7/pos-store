import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetProductsByNameQuery } from './get-products-by-name.query';
import { Product } from '../../../domain/entities/product.entity';

@QueryHandler(GetProductsByNameQuery)
export class GetProductsByNameHandler implements IQueryHandler<GetProductsByNameQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProductsByNameQuery): Promise<any> {
    const { tenantId, name, page = 1, limit = 10 } = query;
    const repo = this.entityManager.getRepository(Product);
    const searchName = `%${name.trim()}%`;
    const take = limit;
    const skip = (page - 1) * limit;

    const [products, total] = await repo.createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.images', 'variantImages')
      .leftJoinAndSelect('variants.stocks', 'stocks')
      .leftJoinAndSelect('variants.attributeValues', 'attributeValues')
      .leftJoinAndSelect('attributeValues.attribute', 'attribute')
      .leftJoinAndSelect('variants.tags', 'tags')
      .where('product.tenantId = :tenantId', { tenantId })
      .andWhere('(product.name ILIKE :searchName OR product.description ILIKE :searchName)', { searchName })
      .orderBy('variants.sku', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    const data = products.map(product => {
      const firstVariant = product.variants?.[0];
      const imageIds = firstVariant && firstVariant.images ? firstVariant.images.map(img => img.id) : [];

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        imageIds: imageIds,
        variants: product.variants.map(variant => ({
          id: variant.id,
          sku: variant.sku,
          barcode: variant.barcode,
          purchasePrice: Number(variant.purchasePrice),
          salePrice: Number(variant.salePrice),
          stocks: variant.stocks,
          attributeValues: variant.attributeValues,
          tags: variant.tags,
          imageIds: variant.images ? variant.images.map(img => img.id) : [],
        }))
      };
    });

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
