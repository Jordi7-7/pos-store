import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, Between } from 'typeorm';
import { GetReportsSummaryQuery } from './get-reports-summary.query';
import { Sale } from '../../../../sales/domain/entities/sale.entity';
import { PurchaseOrder } from '../../../../purchases/domain/entities/purchase-order.entity';
import { Expense } from '../../../../sales/domain/entities/expense.entity';
import { parseReportDates } from '../parse-dates.helper';

@QueryHandler(GetReportsSummaryQuery)
export class GetReportsSummaryHandler implements IQueryHandler<GetReportsSummaryQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetReportsSummaryQuery) {
    const { start, end } = await parseReportDates(
      this.entityManager,
      query.tenantId,
      query.startDateStr,
      query.endDateStr,
    );

    const saleRepository = this.entityManager.getRepository(Sale);
    const purchaseRepository = this.entityManager.getRepository(PurchaseOrder);
    const expenseRepository = this.entityManager.getRepository(Expense);

    // 1. Fetch sales in date range
    const sales = await saleRepository.find({
      where: {
        tenantId: query.tenantId,
        createdAt: Between(start, end),
      },
      relations: { items: true },
    });

    // 2. Fetch purchases in date range
    const purchases = await purchaseRepository.find({
      where: {
        tenantId: query.tenantId,
        createdAt: Between(start, end),
      },
    });

    // 3. Fetch expenses in date range
    const expenses = await expenseRepository.find({
      where: {
        tenantId: query.tenantId,
        createdAt: Between(start, end),
      },
    });

    // Aggregate overall metrics
    let totalSales = 0;
    let totalCOGS = 0;
    let totalPurchases = 0;
    let totalExpenses = 0;

    // Process sales
    for (const sale of sales) {
      if (sale.status === 'REFUNDED') continue;

      totalSales += Number(sale.total || 0);

      if (sale.items) {
        for (const item of sale.items) {
          const qty = Number(item.quantity || 0);
          const cost = Number(item.cost || 0);
          totalCOGS += cost * qty;
        }
      }
    }

    // Process purchases
    for (const pur of purchases) {
      if (pur.status === 'COMPLETED' || pur.status === 'RECEIVED') {
        totalPurchases += Number(pur.totalAmount || 0);
      }
    }

    // Process expenses
    for (const exp of expenses) {
      totalExpenses += Number(exp.amount || 0);
    }

    const grossProfit = totalSales - totalCOGS;
    const netProfit = grossProfit - totalExpenses;

    // Create daily breakdown map
    const dailyMap: Record<string, { date: string; sales: number; purchases: number; expenses: number; profit: number }> = {};

    // Helper to generate YYYY-MM-DD
    const formatDateKey = (d: Date) => {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Initialize map for each day in range
    const current = new Date(start);
    while (current <= end) {
      const key = formatDateKey(current);
      dailyMap[key] = { date: key, sales: 0, purchases: 0, expenses: 0, profit: 0 };
      current.setUTCDate(current.getUTCDate() + 1);
    }

    // Fill sales
    for (const sale of sales) {
      if (sale.status === 'REFUNDED') continue;
      const key = formatDateKey(sale.createdAt);
      if (dailyMap[key]) {
        dailyMap[key].sales += Number(sale.total || 0);
        let saleCOGS = 0;
        if (sale.items) {
          for (const item of sale.items) {
            saleCOGS += Number(item.cost || 0) * Number(item.quantity || 0);
          }
        }
        dailyMap[key].profit += Number(sale.total || 0) - saleCOGS;
      }
    }

    // Fill purchases
    for (const pur of purchases) {
      if (pur.status === 'COMPLETED' || pur.status === 'RECEIVED') {
        const key = formatDateKey(pur.createdAt);
        if (dailyMap[key]) {
          dailyMap[key].purchases += Number(pur.totalAmount || 0);
        }
      }
    }

    // Fill expenses
    for (const exp of expenses) {
      const key = formatDateKey(exp.createdAt);
      if (dailyMap[key]) {
        dailyMap[key].expenses += Number(exp.amount || 0);
        dailyMap[key].profit -= Number(exp.amount || 0);
      }
    }

    const breakdown = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    return {
      summary: {
        totalSales,
        totalCOGS,
        grossProfit,
        totalPurchases,
        totalExpenses,
        netProfit,
      },
      breakdown,
    };
  }
}
