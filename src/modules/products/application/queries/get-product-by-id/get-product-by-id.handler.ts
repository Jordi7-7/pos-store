import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetProductByIdQuery } from './get-product-by-id.query';
import { Product } from '../../../domain/entities/product.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

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
        category: true,
        images: true,
        variants: {
          stocks: true,
          images: true,
          tags: true,
          attributeValues: {
            attribute: true,
          },
        },
      },
    });

    // 2. Si no se encuentra, intentar buscar por ID de Variante
    if (!product) {
      product = await repo.findOne({
        // También acotado a la tienda: sin esto, el id de una variante ajena devolvería su producto
        where: {
          tenantId,
          variants: { id },
        },
        relations: {
          category: true,
          images: true,
          variants: {
            stocks: true,
            images: true,
            tags: true,
            attributeValues: {
              attribute: true,
            },
          },
        },
      });
    }

    if (!product) {
      throw new AppException(ErrorCode.ProductNotFound, 'Producto o variante no encontrado.', HttpStatus.NOT_FOUND, { id });
    }

    return product;
  }
}
