import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetProductsByNameQuery } from './get-products-by-name.query';
import { Product } from '../../../domain/entities/product.entity';
import { ProductType } from '../../../domain/enums/product-type.enum';
import { PaginatedProductsResponseDto, ProductListItemResponseDto } from '../../dtos/product-response.dto';

@QueryHandler(GetProductsByNameQuery)
export class GetProductsByNameHandler implements IQueryHandler<GetProductsByNameQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProductsByNameQuery): Promise<PaginatedProductsResponseDto> {
    const { tenantId, name, page = 1, limit = 10, productType, branchId } = query;
    const repo = this.entityManager.getRepository(Product);
    const searchName = `%${name.trim()}%`;
    const take = limit;
    const skip = (page - 1) * limit;

    const qb = repo.createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.images', 'productImages')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.images', 'variantImages');

    if (branchId) {
      qb.leftJoinAndSelect('variants.stocks', 'stocks', 'stocks.branchId = :branchId', { branchId });
    } else {
      qb.leftJoinAndSelect('variants.stocks', 'stocks');
    }

    qb.leftJoinAndSelect('stocks.branch', 'branch')
      .leftJoinAndSelect('variants.attributeValues', 'attributeValues')
      .leftJoinAndSelect('attributeValues.attribute', 'attribute')
      .where('product.tenantId = :tenantId', { tenantId })
      .andWhere('(product.name ILIKE :searchName OR product.description ILIKE :searchName)', { searchName });

    if (productType && (productType === ProductType.SIMPLE || productType === ProductType.VARIABLE)) {
      qb.andWhere('product.type = :productType', { productType });
    }

    const [products, total] = await qb
      .orderBy('product.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    const data: ProductListItemResponseDto[] = products.map(product => {
      const isVariable = product.type === ProductType.VARIABLE;
      const firstVariant = product.variants?.[0];
      const parentImages = (product.images && product.images.length > 0)
        ? product.images
        : (firstVariant?.images || []);

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        type: product.type || ProductType.SIMPLE,
        baseSku: product.baseSku,
        categoryId: product.categoryId,
        categoryName: product.category ? product.category.name : null,
        images: parentImages.map(img => ({ id: img.id, url: img.url })),
        variants: (product.variants || []).map(variant => {
          const varImages = (variant.images && variant.images.length > 0)
            ? variant.images.map(img => ({ id: img.id, url: img.url }))
            : parentImages.map(img => ({ id: img.id, url: img.url }));

          const variantDto: any = {
            id: variant.id,
            sku: variant.sku,
            barcode: variant.barcode,
            purchasePrice: Number(variant.purchasePrice),
            salePrice: Number(variant.salePrice),
            wholesalePrice: variant.wholesalePrice !== null ? Number(variant.wholesalePrice) : null,
            images: varImages,
            stocks: (variant.stocks || []).map(s => ({
              branchId: s.branchId,
              branchName: s.branch ? s.branch.name : '',
              quantity: Number(s.quantity || 0),
            })),
          };

          if (isVariable && variant.attributeValues && variant.attributeValues.length > 0) {
            variantDto.attributes = variant.attributeValues.map(av => ({
              name: av.attribute ? av.attribute.name : '',
              value: av.value,
            }));
          }

          return variantDto;
        }),
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
