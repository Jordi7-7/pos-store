import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetProductsQuery } from './get-products.query';
import { Product } from '../../../domain/entities/product.entity';

@QueryHandler(GetProductsQuery)
export class GetProductsHandler implements IQueryHandler<GetProductsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProductsQuery): Promise<Product[]> {
    const { tenantId } = query;
    return this.entityManager.getRepository(Product).find({
      where: { tenantId },
      relations: {
        variants: {
          stocks: true,
          attributeValues: {
            attribute: true,
          },
        },
      },
    });
  }
}
