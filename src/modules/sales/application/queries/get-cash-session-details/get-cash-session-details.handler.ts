import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { GetCashSessionDetailsQuery } from './get-cash-session-details.query';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { Sale } from '../../../domain/entities/sale.entity';
import { Expense } from '../../../domain/entities/expense.entity';
import { Refund } from '../../../domain/entities/refund.entity';

@QueryHandler(GetCashSessionDetailsQuery)
export class GetCashSessionDetailsHandler implements IQueryHandler<GetCashSessionDetailsQuery> {
  constructor(
    @InjectRepository(CashSession)
    private readonly cashSessionRepository: Repository<CashSession>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(Refund)
    private readonly refundRepository: Repository<Refund>,
  ) {}

  async execute(query: GetCashSessionDetailsQuery) {
    const { tenantId, sessionId } = query;

    const session = await this.cashSessionRepository
      .createQueryBuilder('cs')
      .innerJoinAndSelect('cs.branch', 'branch')
      .leftJoinAndSelect('cs.user', 'user')
      .leftJoinAndSelect('cs.cashRegister', 'cashRegister')
      .where('cs.id = :sessionId', { sessionId })
      .andWhere('branch.tenantId = :tenantId', { tenantId })
      .getOne();

    if (!session) {
      throw new NotFoundException(`Cash session with ID ${sessionId} not found or access denied`);
    }

    // Ventas de esta sesión (solo datos esenciales para la UI)
    const rawSales = await this.saleRepository.find({
      where: { cashSessionId: sessionId, tenantId },
      withDeleted: true,
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        status: true,
        createdAt: true,
        customer: {
          id: true,
          name: true,
          identityNumber: true,
        },
        user: {
          id: true,
          name: true,
        },
        payments: {
          id: true,
          paymentMethod: true,
          amount: true,
        },
        items: {
          id: true,
          variantId: true,
          quantity: true,
          price: true,
          discountAmount: true,
          variant: {
            id: true,
            sku: true,
            product: {
              id: true,
              name: true,
            },
            attributeValues: {
              id: true,
              value: true,
            },
          },
        },
      },
      relations: {
        customer: true,
        user: true,
        payments: true,
        items: {
          variant: {
            product: true,
            attributeValues: true,
          },
        },
      },
      order: { createdAt: 'DESC' },
    });

    // Gastos de esta sesión
    const expenses = await this.expenseRepository.find({
      where: { cashSessionId: sessionId, tenantId },
      select: {
        id: true,
        description: true,
        amount: true,
        category: true,
        createdAt: true,
        user: {
          id: true,
          name: true,
        },
      },
      relations: {
        user: true,
      },
      order: { createdAt: 'DESC' },
    });

    // Devoluciones procesadas durante esta sesión (solo datos esenciales)
    const rawRefunds = await this.refundRepository.find({
      where: { cashSessionId: sessionId, tenantId },
      withDeleted: true,
      select: {
        id: true,
        reason: true,
        totalRefunded: true,
        createdAt: true,
        user: {
          id: true,
          name: true,
        },
        sale: {
          id: true,
          invoiceNumber: true,
        },
        items: {
          id: true,
          quantity: true,
          priceRefunded: true,
          variant: {
            id: true,
            sku: true,
            product: {
              id: true,
              name: true,
            },
          },
        },
      },
      relations: {
        user: true,
        sale: true,
        items: {
          variant: {
            product: true,
          },
        },
      },
      order: { createdAt: 'DESC' },
    });

    // Cálculos de resumen en Backend
    let grossSales = 0;
    let cashSales = 0;
    let cardSales = 0;

    const sales = rawSales.map((s) => {
      const saleTotal = Number(s.total || 0);
      grossSales += saleTotal;

      if (s.status !== 'REFUNDED') {
        const payments = s.payments || [];
        if (payments.length > 0) {
          payments.forEach((p) => {
            const amt = Number(p.amount || 0);
            if (p.paymentMethod === 'TARJETA') cardSales += amt;
            else if (p.paymentMethod === 'EFECTIVO') cashSales += amt;
          });
        } else {
          cashSales += saleTotal;
        }
      }

      const totalItems = (s.items || []).reduce((acc, it) => acc + Number(it.quantity || 0), 0);

      return {
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        total: saleTotal,
        status: s.status,
        createdAt: s.createdAt,
        customerName: s.customer?.name || 'CONSUMIDOR FINAL',
        userName: s.user?.name || 'Sin especificar',
        totalItems,
        paymentMethod: s.payments?.[0]?.paymentMethod || 'EFECTIVO',
        payments: s.payments,
        items: s.items,
        user: s.user ? { id: s.user.id, name: s.user.name } : undefined,
        customer: s.customer ? { id: s.customer.id, name: s.customer.name, identityNumber: s.customer.identityNumber } : undefined,
      };
    });

    const mappedExpenses = expenses.map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount || 0),
      category: e.category,
      createdAt: e.createdAt,
      userName: e.user?.name || 'Sin especificar',
    }));

    const refunds = rawRefunds.map((r) => ({
      id: r.id,
      reason: r.reason,
      totalRefunded: Number(r.totalRefunded || 0),
      createdAt: r.createdAt,
      userName: r.user?.name || 'Sin especificar',
      sale: r.sale ? { id: r.sale.id, invoiceNumber: r.sale.invoiceNumber } : undefined,
      items: r.items,
    }));

    const totalExpenses = mappedExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
    const totalRefunds = refunds.reduce((acc, r) => acc + Number(r.totalRefunded || 0), 0);

    const netSales = Math.max(grossSales - totalRefunds, 0);

    // Calcular duración de la sesión
    const openedTime = new Date(session.openedAt).getTime();
    const closedTime = session.closedAt ? new Date(session.closedAt).getTime() : Date.now();
    const durationMs = Math.max(closedTime - openedTime, 0);
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const durationFormatted = `${hours}h ${minutes}m`;

    const openingBalance = Number(session.openingBalance || 0);
    const closingBalance = session.closingBalance !== null ? Number(session.closingBalance) : null;
    const expectedBalance = session.expectedBalance !== null 
      ? Number(session.expectedBalance)
      : Math.round((openingBalance + cashSales - totalExpenses - totalRefunds) * 100) / 100;

    const difference = session.difference !== null 
      ? Number(session.difference)
      : (closingBalance !== null ? Math.round((closingBalance - expectedBalance) * 100) / 100 : null);

    return {
      session: {
        id: session.id,
        status: session.status,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        durationFormatted,
        openedBy: session.user?.name || 'No especificado',
        branchName: session.branch?.name || '',
        cashRegister: session.cashRegister ? {
          id: session.cashRegister.id,
          name: session.cashRegister.name,
          code: session.cashRegister.code,
        } : null,
        openingBalance,
        closingBalance,
        expectedBalance,
        difference,
      },
      kpis: {
        grossSales: Number(grossSales.toFixed(2)),
        netSales: Number(netSales.toFixed(2)),
        cashSales: Number(cashSales.toFixed(2)),
        cardSales: Number(cardSales.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        totalRefunds: Number(totalRefunds.toFixed(2)),
        salesCount: sales.length,
        expensesCount: expenses.length,
        refundsCount: refunds.length,
      },
      sales,
      expenses: mappedExpenses,
      refunds,
    };
  }
}
