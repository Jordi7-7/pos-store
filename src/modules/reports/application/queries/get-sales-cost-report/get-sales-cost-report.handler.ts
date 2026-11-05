import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, Between, FindOptionsWhere, In } from 'typeorm';
import { GetSalesCostReportQuery } from './get-sales-cost-report.query';
import { Sale } from '../../../../sales/domain/entities/sale.entity';
import { parseReportDates } from '../parse-dates.helper';
import { SaleStatus } from '../../../../../common/enums/sale-status.enum';
import { Money } from '../../../../../common/domain/money';
import { CONSUMER_FINAL_NAME } from '../../../../customers/domain/consumer-final';

import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanAccessBranch } from '../../../../../common/security/branch-access.helper';

@QueryHandler(GetSalesCostReportQuery)
export class GetSalesCostReportHandler implements IQueryHandler<GetSalesCostReportQuery> {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(query: GetSalesCostReportQuery) {
    await assertUserCanAccessBranch(this.entityManager, this.redisService, {
      userId: query.userId,
      isOwner: query.isOwner,
      branchId: query.branchId,
      actionDescription: 'consultar el reporte de costo de ventas',
    });

    const { start, end } = await parseReportDates(
      this.entityManager,
      query.tenantId,
      query.startDateStr,
      query.endDateStr,
    );

    const saleRepository = this.entityManager.getRepository(Sale);

    const whereClause: FindOptionsWhere<Sale> = {
      tenantId: query.tenantId,
      createdAt: Between(start, end),
      status: In([SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED]),
    };

    if (query.branchId) {
      whereClause.branchId = query.branchId;
    }

    const sales = await saleRepository.find({
      where: whereClause,
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
      let costPrice = Money.ZERO;
      let salePrice = Money.ZERO;
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

      for (const item of sale.items ?? []) {
        const qty = Number(item.quantity || 0);
        const refundedQty = Number(item.refundedQuantity || 0);
        const netQty = Math.max(0, qty - refundedQty);
        const unitCost = Number(item.cost || 0);
        const unitPrice = Number(item.price || 0);

        // Costo y venta netos (descontando piezas devueltas y la parte proporcional de los descuentos)
        const lineCost = Money.ofLine(unitCost, netQty);
        const totalItemDiscount = Money.of(item.discountAmount || 0).plus(Money.of(item.globalDiscountAmount || 0));
        const netLineDiscount = totalItemDiscount.fraction(netQty, qty || 1);
        const lineSale = Money.ofLine(unitPrice, netQty).minus(netLineDiscount);
        const lineProfit = lineSale.minus(lineCost);

        pieces += netQty;
        costPrice = costPrice.plus(lineCost);
        salePrice = salePrice.plus(lineSale);

        itemsDetail.push({
          id: item.id,
          variantId: item.variantId,
          productName: item.variant?.product?.name || 'Producto sin nombre',
          sku: item.variant?.sku || '',
          quantity: qty,
          refundedQuantity: refundedQty,
          netQuantity: netQty,
          unitCost,
          totalCost: lineCost.toNumber(),
          unitPrice,
          discountAmount: netLineDiscount.toNumber(),
          totalPrice: lineSale.toNumber(),
          profit: lineProfit.toNumber(),
        });
      }

      return {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        createdAt: sale.createdAt,
        clientName: sale.customer?.name || CONSUMER_FINAL_NAME,
        pieces,
        salePrice: salePrice.toNumber(),
        costPrice: costPrice.toNumber(),
        difference: salePrice.minus(costPrice).toNumber(),
        status: sale.status,
        items: itemsDetail,
      };
    });
  }
}
