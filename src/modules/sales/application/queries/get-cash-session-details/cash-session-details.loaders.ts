import { FindOptionsRelations, FindOptionsSelect } from 'typeorm';
import { Expense } from '../../../domain/entities/expense.entity';
import { Refund } from '../../../domain/entities/refund.entity';
import { Sale } from '../../../domain/entities/sale.entity';

/** Columnas que necesita la pantalla de arqueo; evita traer las entidades completas. */
export const SALE_SELECT: FindOptionsSelect<Sale> = {
  id: true,
  invoiceNumber: true,
  subtotal: true,
  total: true,
  discountAmount: true,
  itemsDiscountAmount: true,
  globalDiscountAmount: true,
  discountType: true,
  discountRate: true,
  status: true,
  createdAt: true,
  customer: { id: true, name: true, identityNumber: true },
  user: { id: true, name: true },
  payments: { id: true, paymentMethod: true, amount: true },
  items: {
    id: true,
    variantId: true,
    quantity: true,
    price: true,
    subtotal: true,
    total: true,
    discountAmount: true,
    discountType: true,
    discountRate: true,
    globalDiscountAmount: true,
    variant: {
      id: true,
      sku: true,
      product: { id: true, name: true },
      attributeValues: { id: true, value: true },
    },
  },
};

export const SALE_RELATIONS: FindOptionsRelations<Sale> = {
  customer: true,
  user: true,
  payments: true,
  items: { variant: { product: true, attributeValues: true } },
};

export const EXPENSE_SELECT: FindOptionsSelect<Expense> = {
  id: true,
  description: true,
  amount: true,
  category: true,
  createdAt: true,
  user: { id: true, name: true },
};

export const EXPENSE_RELATIONS: FindOptionsRelations<Expense> = { user: true };

export const REFUND_SELECT: FindOptionsSelect<Refund> = {
  id: true,
  reason: true,
  totalRefunded: true,
  createdAt: true,
  user: { id: true, name: true },
  sale: { id: true, invoiceNumber: true },
  items: {
    id: true,
    quantity: true,
    priceRefunded: true,
    variant: { id: true, sku: true, product: { id: true, name: true } },
  },
};

export const REFUND_RELATIONS: FindOptionsRelations<Refund> = {
  user: true,
  sale: true,
  items: { variant: { product: true } },
};
