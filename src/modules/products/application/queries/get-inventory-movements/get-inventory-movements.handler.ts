import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetInventoryMovementsQuery } from './get-inventory-movements.query';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';

@QueryHandler(GetInventoryMovementsQuery)
export class GetInventoryMovementsHandler implements IQueryHandler<GetInventoryMovementsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetInventoryMovementsQuery): Promise<InventoryMovement[]> {
    const { tenantId, variantId } = query;
    const repo = this.entityManager.getRepository(InventoryMovement);

    const where: any = { tenantId };
    if (variantId) {
      where.variantId = variantId;
    }

    return repo.find({
      where,
      relations: {
        variant: { product: true },
        originBranch: true,
        destinationBranch: true,
      },
      order: { createdAt: 'DESC' },
    });
  }
}
