import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, Between, In } from 'typeorm';
import { GetSalesCostReportQuery } from './get-sales-cost-report.query';
import { Sale } from '../../../../sales/domain/entities/sale.entity';
import { parseReportDates } from '../parse-dates.helper';
import { SaleStatus } from '../../../../../common/enums/sale-status.enum';

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
        status: In([SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED]),
      },
      relations: {
        customer: true,
        items: {
          variant: {
            product: true,
          },
        },
      },
      order: { createdAt: 'ASC' },
    });

    return sales.map((sale) => {
      let pieces = 0;
      let costPrice = 0;
      let salePrice = 0;
      const itemsDetail: Array<{
        id: string;
        variantId: string;
        productName: string;
        sku: string;
        quantity: number;
        refundedQuantity: number;
        netQuantity: number;
        unitCost: number;
        totalCost: number;
        unitPrice: number;
        discountAmount: number;
        totalPrice: number;
        profit: number;
      }> = [];

      if (sale.items) {
        for (const item of sale.items) {
          const qty = Number(item.quantity || 0);
          const refundedQty = Number(item.refundedQuantity || 0);
          const netQty = Math.max(0, qty - refundedQty);
          const unitCost = Number(item.cost || 0);
          const unitPrice = Number(item.price || 0);

          // Costo y venta netos (descontando piezas devueltas)
          const lineCost = unitCost * netQty;
          const soldQty = qty || 1;
          const discountPerUnit = Number(item.discountAmount || 0) / soldQty;
          const netLineDiscount = discountPerUnit * netQty;
          const lineSale = unitPrice * netQty - netLineDiscount;
          const lineProfit = lineSale - lineCost;

          pieces += netQty;
          costPrice += lineCost;
          salePrice += lineSale;

          itemsDetail.push({
            id: item.id,
            variantId: item.variantId,
            productName: item.variant?.product?.name || 'Producto sin nombre',
            sku: item.variant?.sku || '',
            quantity: qty,
            refundedQuantity: refundedQty,
            netQuantity: netQty,
            unitCost,
            totalCost: lineCost,
            unitPrice,
            discountAmount: netLineDiscount,
            totalPrice: lineSale,
            profit: lineProfit,
          });
        }
      }

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
        items: itemsDetail,
      };
    });
  }
}
