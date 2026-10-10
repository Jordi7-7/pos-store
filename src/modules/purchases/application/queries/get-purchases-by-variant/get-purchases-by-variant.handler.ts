import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetPurchasesByVariantQuery } from './get-purchases-by-variant.query';
import { PurchaseOrder } from '../../../domain/entities/purchase-order.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';

@QueryHandler(GetPurchasesByVariantQuery)
export class GetPurchasesByVariantHandler implements IQueryHandler<GetPurchasesByVariantQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetPurchasesByVariantQuery) {
    const { tenantId, variantId, page, limit, branchId, userId, userRole } = query;
    const queryBuilder = this.entityManager.getRepository(PurchaseOrder)
      .createQueryBuilder('purchase')
      .innerJoinAndSelect('purchase.items', 'item')
      .innerJoinAndSelect('item.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .leftJoinAndSelect('purchase.supplier', 'supplier')
      .leftJoinAndSelect('purchase.branch', 'branch')
      .where('purchase.tenantId = :tenantId', { tenantId })
      .andWhere('item.variantId = :variantId', { variantId });

    const isOwner = userRole === UserRole.OWNER;
    if (isOwner) {
      if (branchId) {
        queryBuilder.andWhere('purchase.branchId = :branchId', { branchId });
      }
    } else {
      if (!branchId) {
        throw new BadRequestException('Debes seleccionar una sucursal para consultar las compras de la variante.');
      }

      const user = await this.entityManager.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [userId],
      );
      const userBranchIds = (user || []).map((r: any) => r.branch_id);

      if (!userBranchIds.includes(branchId)) {
        throw new ForbiddenException('No tienes permisos para consultar compras en la sucursal seleccionada.');
      }

      queryBuilder.andWhere('purchase.branchId = :branchId', { branchId });
    }

    const [data, total] = await queryBuilder
      .orderBy('purchase.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
