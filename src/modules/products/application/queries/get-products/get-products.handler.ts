import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetProductsQuery } from './get-products.query';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';

@QueryHandler(GetProductsQuery)
export class GetProductsHandler implements IQueryHandler<GetProductsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProductsQuery): Promise<any> {
    const { tenantId, page = 1, limit = 10 } = query;
    const repo = this.entityManager.getRepository(ProductVariant);
    const take = limit;
    const skip = (page - 1) * limit;

    const [variants, total] = await repo.createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('product.images', 'productImages')
      .leftJoinAndSelect('variant.images', 'variantImages')
      .leftJoinAndSelect('variant.stocks', 'stocks')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .leftJoinAndSelect('attributeValues.attribute', 'attribute')
      .leftJoinAndSelect('variant.tags', 'tags')
      .where('variant.tenantId = :tenantId', { tenantId })
      .orderBy('variant.sku', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    const data = variants.map(variant => {
      // Si el producto padre tiene imágenes las usamos; si no, heredamos las de la variante
      const parentImages = (variant.product.images && variant.product.images.length > 0)
        ? variant.product.images
        : (variant.images || []);

      return {
        id: variant.product.id,
        name: variant.product.name,
        description: variant.product.description,
        imageIds: parentImages.map(img => img.id),
        images: parentImages.map(img => ({ id: img.id, url: img.url, description: img.description })),
        variants: [
          {
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
          }
        ]
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
