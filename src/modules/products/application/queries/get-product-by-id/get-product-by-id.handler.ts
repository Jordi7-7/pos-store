import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetProductByIdQuery } from './get-product-by-id.query';
import { Product } from '../../../domain/entities/product.entity';

@QueryHandler(GetProductByIdQuery)
export class GetProductByIdHandler implements IQueryHandler<GetProductByIdQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProductByIdQuery): Promise<Product> {
    const { tenantId, id } = query;
    const product = await this.entityManager.getRepository(Product).findOne({
      where: { id, tenantId },
      relations: {
        variants: {
          stocks: true,
          attributeValues: {
            attribute: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }
}
