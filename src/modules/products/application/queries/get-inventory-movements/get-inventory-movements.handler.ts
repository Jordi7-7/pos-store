import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Brackets, EntityManager } from 'typeorm';
import { GetInventoryMovementsQuery } from './get-inventory-movements.query';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';

@QueryHandler(GetInventoryMovementsQuery)
export class GetInventoryMovementsHandler implements IQueryHandler<GetInventoryMovementsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetInventoryMovementsQuery) {
    const { tenantId, branchId, page, limit } = query;
    const repo = this.entityManager.getRepository(InventoryMovement);

    const queryBuilder = repo.createQueryBuilder('movement')
      .leftJoinAndSelect('movement.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('movement.originBranch', 'originBranch')
      .leftJoinAndSelect('movement.destinationBranch', 'destinationBranch')
      .where('movement.tenantId = :tenantId', { tenantId });

    queryBuilder.andWhere(new Brackets((branchQuery) => {
      branchQuery
        .where('movement.originBranchId = :branchId', { branchId })
        .orWhere('movement.destinationBranchId = :branchId', { branchId });
    }));

    const [data, total] = await queryBuilder
      .orderBy('movement.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
