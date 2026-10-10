import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetInventoryMovementsByVariantQuery } from './get-inventory-movements-by-variant.query';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';

@QueryHandler(GetInventoryMovementsByVariantQuery)
export class GetInventoryMovementsByVariantHandler implements IQueryHandler<GetInventoryMovementsByVariantQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetInventoryMovementsByVariantQuery) {
    const { tenantId, variantId, page, limit, branchId, userId, userRole } = query;
    const repo = this.entityManager.getRepository(InventoryMovement);

    const qb = repo.createQueryBuilder('movement')
      .leftJoinAndSelect('movement.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('movement.originBranch', 'originBranch')
      .leftJoinAndSelect('movement.destinationBranch', 'destinationBranch')
      .where('movement.tenantId = :tenantId', { tenantId })
      .andWhere('movement.variantId = :variantId', { variantId });

    const isOwner = userRole === UserRole.OWNER;
    if (isOwner) {
      if (branchId) {
        qb.andWhere(
          '(movement.originBranchId = :branchId OR movement.destinationBranchId = :branchId)',
          { branchId },
        );
      }
    } else {
      if (!branchId) {
        throw new BadRequestException('Debes seleccionar una sucursal para consultar los movimientos de la variante.');
      }

      const user = await this.entityManager.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [userId],
      );
      const userBranchIds = (user || []).map((r: any) => r.branch_id);

      if (!userBranchIds.includes(branchId)) {
        throw new ForbiddenException('No tienes permisos para consultar movimientos en la sucursal seleccionada.');
      }

      qb.andWhere(
        '(movement.originBranchId = :branchId OR movement.destinationBranchId = :branchId)',
        { branchId },
      );
    }

    const [data, total] = await qb
      .orderBy('movement.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
