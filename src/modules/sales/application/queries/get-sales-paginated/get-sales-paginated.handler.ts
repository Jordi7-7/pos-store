import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Between, EntityManager } from 'typeorm';
import { GetSalesPaginatedQuery } from './get-sales-paginated.query';
import { Sale } from '../../../domain/entities/sale.entity';
import { parseReportDates } from '../../../../reports/application/queries/parse-dates.helper';

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
      .where('sale.tenantId = :tenantId', { tenantId: query.tenantId })
      .andWhere('sale.createdAt BETWEEN :start AND :end', { start, end })
      .select([
        'sale.id',
        'sale.invoiceNumber',
        'sale.createdAt',
        'sale.total',
        'sale.discountAmount',
        'sale.status',
        'customer.id',
        'customer.name',
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
