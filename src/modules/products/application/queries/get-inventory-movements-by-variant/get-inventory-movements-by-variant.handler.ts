import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetInventoryMovementsByVariantQuery } from './get-inventory-movements-by-variant.query';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';

@QueryHandler(GetInventoryMovementsByVariantQuery)
export class GetInventoryMovementsByVariantHandler implements IQueryHandler<GetInventoryMovementsByVariantQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetInventoryMovementsByVariantQuery) {
    const { tenantId, variantId, page, limit } = query;
    const repo = this.entityManager.getRepository(InventoryMovement);

    const [data, total] = await repo.findAndCount({
      where: { tenantId, variantId },
      relations: {
        variant: { product: true },
        originBranch: true,
        destinationBranch: true,
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
