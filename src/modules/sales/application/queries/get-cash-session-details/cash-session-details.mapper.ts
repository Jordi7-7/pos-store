import { Money } from '../../../../../common/domain/money';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { Expense } from '../../../domain/entities/expense.entity';
import { Refund } from '../../../domain/entities/refund.entity';
import { PaymentMethod } from '../../../domain/entities/sale-payment.entity';
import { Sale } from '../../../domain/entities/sale.entity';

const DEFAULT_CUSTOMER_NAME = 'CONSUMIDOR FINAL';
const UNSPECIFIED_USER = 'Sin especificar';

type Numeric = number | string | null | undefined;

function amount(value: Numeric): number {
  return Money.of(value ?? 0).toNumber();
}

function nullableAmount(value: Numeric): number | null {
  return value === null || value === undefined ? null : amount(value);
}

export function toSaleDetail(sale: Sale) {
  const items = sale.items ?? [];
  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    subtotal: amount(sale.subtotal),
    total: amount(sale.total),
    discountAmount: amount(sale.discountAmount),
    itemsDiscountAmount: amount(sale.itemsDiscountAmount),
    globalDiscountAmount: amount(sale.globalDiscountAmount),
    discountType: sale.discountType,
    discountRate: nullableAmount(sale.discountRate),
    status: sale.status,
    createdAt: sale.createdAt,
    customerName: sale.customer?.name || DEFAULT_CUSTOMER_NAME,
    userName: sale.user?.name || UNSPECIFIED_USER,
    totalItems: items.reduce((total, item) => total + Number(item.quantity || 0), 0),
    paymentMethod: sale.payments?.[0]?.paymentMethod || PaymentMethod.EFECTIVO,
    payments: sale.payments,
    items: sale.items,
    user: sale.user ? { id: sale.user.id, name: sale.user.name } : undefined,
    customer: sale.customer
      ? { id: sale.customer.id, name: sale.customer.name, identityNumber: sale.customer.identityNumber }
      : undefined,
  };
}

export function toExpenseDetail(expense: Expense) {
  return {
    id: expense.id,
    description: expense.description,
    amount: amount(expense.amount),
    category: expense.category,
    createdAt: expense.createdAt,
    userName: expense.user?.name || UNSPECIFIED_USER,
  };
}

export function toRefundDetail(refund: Refund) {
  return {
    id: refund.id,
    reason: refund.reason,
    totalRefunded: amount(refund.totalRefunded),
    createdAt: refund.createdAt,
    userName: refund.user?.name || UNSPECIFIED_USER,
    sale: refund.sale ? { id: refund.sale.id, invoiceNumber: refund.sale.invoiceNumber } : undefined,
    items: refund.items,
  };
}

export function toSessionHeader(session: CashSession) {
  return {
    id: session.id,
    status: session.status,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    branch: {
      id: session.branch.id,
      name: session.branch.name,
      address: session.branch.address || '',
    },
    // Las sesiones antiguas pueden no tener caja ni usuario asociados
    cashRegister: {
      id: session.cashRegister?.id ?? null,
      name: session.cashRegister?.name ?? 'Sin caja asignada',
      code: session.cashRegister?.code ?? null,
    },
    user: { id: session.user?.id ?? null, name: session.user?.name ?? UNSPECIFIED_USER },
  };
}

export { amount as toAmount, nullableAmount as toNullableAmount };
