import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Between, EntityManager } from 'typeorm';
import { GetSalesPaginatedQuery } from './get-sales-paginated.query';
import { Sale } from '../../../domain/entities/sale.entity';
import { parseReportDates } from '../../../../reports/application/queries/parse-dates.helper';
import { User } from '../../../../users/domain/entities/user.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';

@QueryHandler(GetSalesPaginatedQuery)
export class GetSalesPaginatedHandler implements IQueryHandler<GetSalesPaginatedQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetSalesPaginatedQuery) {
    const { start, end } = await parseReportDates(
      this.entityManager,
      query.tenantId,
      query.startDateStr,
      query.endDateStr,
    );
    const salesQuery = this.entityManager.getRepository(Sale)
      .createQueryBuilder('sale')
      .leftJoin('sale.customer', 'customer')
      .leftJoin('sale.branch', 'branch')
      .where('sale.tenantId = :tenantId', { tenantId: query.tenantId })
      .andWhere('sale.createdAt BETWEEN :start AND :end', { start, end });

    // Role-based branch enforcement
    const isOwner = query.userRole === UserRole.OWNER;

    if (isOwner) {
      if (query.branchId) {
        salesQuery.andWhere('sale.branchId = :branchId', { branchId: query.branchId });
      }
    } else {
      if (!query.branchId) {
        throw new BadRequestException('Debes seleccionar una sucursal para consultar las ventas.');
      }

      const user = await this.entityManager.findOne(User, {
        where: { id: query.userId, tenantId: query.tenantId },
        relations: { branches: true },
      });
      const userBranchIds = (user?.branches || []).map((b) => b.id);

      if (!userBranchIds.includes(query.branchId)) {
        throw new ForbiddenException('No tienes permisos para consultar ventas en la sucursal seleccionada.');
      }

      salesQuery.andWhere('sale.branchId = :branchId', { branchId: query.branchId });
    }

    salesQuery
      .select([
        'sale.id',
        'sale.invoiceNumber',
        'sale.createdAt',
        'sale.total',
        'sale.discountAmount',
        'sale.status',
        'customer.id',
        'customer.name',
        'branch.id',
        'branch.name',
      ])
      .orderBy('sale.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [data, total] = await salesQuery.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
