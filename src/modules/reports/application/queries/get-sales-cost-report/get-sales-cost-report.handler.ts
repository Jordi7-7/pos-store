import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, Between } from 'typeorm';
import { GetSalesCostReportQuery } from './get-sales-cost-report.query';
import { Sale } from '../../../../sales/domain/entities/sale.entity';
import { parseReportDates } from '../parse-dates.helper';

@QueryHandler(GetSalesCostReportQuery)
export class GetSalesCostReportHandler implements IQueryHandler<GetSalesCostReportQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetSalesCostReportQuery) {
    const { start, end } = await parseReportDates(
      this.entityManager,
      query.tenantId,
      query.startDateStr,
      query.endDateStr,
    );

    const saleRepository = this.entityManager.getRepository(Sale);

    const sales = await saleRepository.find({
      where: {
        tenantId: query.tenantId,
        createdAt: Between(start, end),
      },
      relations: {
        customer: true,
        items: true,
      },
      order: { createdAt: 'ASC' },
    });

    return sales.map((sale) => {
      let pieces = 0;
      let costPrice = 0;

      if (sale.items) {
        for (const item of sale.items) {
          const qty = Number(item.quantity || 0);
          pieces += qty;
          costPrice += Number(item.cost || 0) * qty;
        }
      }

      const salePrice = Number(sale.total || 0);
      const difference = salePrice - costPrice;

      return {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        clientName: sale.customer?.name || 'PUBLICO VENTA DE MOSTRADOR',
        pieces,
        salePrice,
        costPrice,
        difference,
        status: sale.status,
      };
    });
  }
}
