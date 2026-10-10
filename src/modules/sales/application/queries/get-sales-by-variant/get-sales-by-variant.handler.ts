import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetSalesByVariantQuery } from './get-sales-by-variant.query';
import { Sale } from '../../../domain/entities/sale.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';

@QueryHandler(GetSalesByVariantQuery)
export class GetSalesByVariantHandler implements IQueryHandler<GetSalesByVariantQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetSalesByVariantQuery) {
    const { tenantId, variantId, page, limit, branchId, userId, userRole } = query;
    const queryBuilder = this.entityManager.getRepository(Sale)
      .createQueryBuilder('sale')
      .innerJoinAndSelect('sale.items', 'item')
      .innerJoinAndSelect('item.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('sale.payments', 'payments')
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('item.variantId = :variantId', { variantId });

    const isOwner = userRole === UserRole.OWNER;
    if (isOwner) {
      if (branchId) {
        queryBuilder.andWhere('sale.branchId = :branchId', { branchId });
      }
    } else {
      if (!branchId) {
        throw new BadRequestException('Debes seleccionar una sucursal para consultar las ventas de la variante.');
      }

      const user = await this.entityManager.query(
        `SELECT branch_id FROM user_branches WHERE user_id = $1`,
        [userId],
      );
      const userBranchIds = (user || []).map((r: any) => r.branch_id);

      if (!userBranchIds.includes(branchId)) {
        throw new ForbiddenException('No tienes permisos para consultar ventas en la sucursal seleccionada.');
      }

      queryBuilder.andWhere('sale.branchId = :branchId', { branchId });
    }

    const [data, total] = await queryBuilder
      .orderBy('sale.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
