import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetProductsQuery } from './get-products.query';
import { Product } from '../../../domain/entities/product.entity';

@QueryHandler(GetProductsQuery)
export class GetProductsHandler implements IQueryHandler<GetProductsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProductsQuery): Promise<any> {
    const { tenantId, page = 1, limit = 10, search } = query;
    const repo = this.entityManager.getRepository(Product);

    const queryBuilder = repo.createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('variants.stocks', 'stocks')
      .leftJoinAndSelect('variants.images', 'variantImages')
      .leftJoinAndSelect('variants.attributeValues', 'attributeValues')
      .leftJoinAndSelect('attributeValues.attribute', 'attribute')
      .where('product.tenantId = :tenantId', { tenantId });

    if (search) {
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.description ILIKE :search OR variants.sku ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    const take = limit;
    const skip = (page - 1) * limit;

    // We use skip and take. For leftJoinAndSelect with relations, TypeORM requires getManyAndCount
    // to handle skip/take correctly via subqueries.
    queryBuilder
      .orderBy('product.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    const [data, total] = await queryBuilder.getManyAndCount();

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
