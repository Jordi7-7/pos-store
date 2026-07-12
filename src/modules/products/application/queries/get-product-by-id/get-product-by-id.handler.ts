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
    const repo = this.entityManager.getRepository(Product);

    // 1. Intentar buscar por ID de Producto
    let product = await repo.findOne({
      where: { id, tenantId },
      relations: {
        images: true,
        variants: {
          stocks: true,
          images: true,
          attributeValues: {
            attribute: true,
          },
        },
      },
    });

    // 2. Si no se encuentra, intentar buscar por ID de Variante
    if (!product) {
      product = await repo.findOne({
        where: {
          variants: { id }
        },
        relations: {
          images: true,
          variants: {
            stocks: true,
            images: true,
            attributeValues: {
              attribute: true,
            },
          },
        },
      });
    }

    if (!product) {
      throw new NotFoundException(`Product or Variant with ID ${id} not found`);
    }

    return product;
  }
}
