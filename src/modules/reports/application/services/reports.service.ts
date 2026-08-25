import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Sale } from '../../../sales/domain/entities/sale.entity';
import { PurchaseOrder } from '../../../purchases/domain/entities/purchase-order.entity';
import { Expense } from '../../../sales/domain/entities/expense.entity';
import { DateTime } from 'luxon';
import { getTimezone } from '../../../../common/tenant/tenant-context';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseRepository: Repository<PurchaseOrder>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
  ) {}

  async parseReportDates(tenantId: string, startDate?: string, endDate?: string): Promise<{ start: Date; end: Date }> {
    const tenant = await this.saleRepository.manager.findOne(Tenant, {
      where: { id: tenantId }
    });
    const timezone = tenant?.timezone || 'America/Guayaquil';

    const start = startDate 
      ? DateTime.fromISO(startDate, { zone: timezone }).startOf('day').toJSDate()
      : DateTime.now().setZone(timezone).startOf('month').toJSDate();
      
    const end = endDate 
      ? DateTime.fromISO(endDate, { zone: timezone }).endOf('day').toJSDate()
      : DateTime.now().setZone(timezone).endOf('day').toJSDate();

    return { start, end };
  }

  async getSummary(tenantId: string, startDateStr?: string, endDateStr?: string) {
    const { start, end } = await this.parseReportDates(tenantId, startDateStr, endDateStr);

    // 1. Fetch sales in date range
    const sales = await this.saleRepository.find({
      where: {
        tenantId,
        createdAt: Between(start, end),
      },
      relations: { items: true },
    });

    // 2. Fetch purchases in date range
    const purchases = await this.purchaseRepository.find({
      where: {
        tenantId,
        createdAt: Between(start, end),
      },
    });

    // 3. Fetch expenses in date range
    const expenses = await this.expenseRepository.find({
      where: {
        tenantId,
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

  async getSalesCostReport(tenantId: string, startDateStr?: string, endDateStr?: string) {
    const { start, end } = await this.parseReportDates(tenantId, startDateStr, endDateStr);

    const sales = await this.saleRepository.find({
      where: {
        tenantId,
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
        invoiceNumber: `FAC-${sale.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
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
