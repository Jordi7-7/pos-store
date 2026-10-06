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
      .leftJoinAndSelect('product.images', 'productImages')
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
      const parentImages = (product.images && product.images.length > 0)
        ? product.images
        : (firstVariant?.images || []);
      const imageIds = parentImages.map(img => img.id);
      const images = parentImages.map(img => ({ id: img.id, url: img.url, description: img.description }));

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        imageIds: imageIds,
        images: images,
        variants: product.variants.map(variant => ({
          id: variant.id,
          sku: variant.sku,
          barcode: variant.barcode,
          purchasePrice: Number(variant.purchasePrice),
          salePrice: Number(variant.salePrice),
          wholesalePrice: variant.wholesalePrice !== null ? Number(variant.wholesalePrice) : null,
          stocks: variant.stocks,
          attributeValues: variant.attributeValues,
          tags: variant.tags,
          imageIds: variant.images ? variant.images.map(img => img.id) : [],
          images: variant.images ? variant.images.map(img => ({ id: img.id, url: img.url, description: img.description })) : [],
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
