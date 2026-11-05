import { PaymentMethod } from '../../../domain/entities/sale-payment.entity';

export interface SaleItemInput {
  variantId: string;
  quantity: number;
  price: number;
  discountType?: string;
  discountRate?: number;
  discountAmount?: number;
}

export interface SalePaymentInput {
  paymentMethod: PaymentMethod;
  amount: number;
  referenceNumber?: string;
}

export class ProcessSaleCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly branchId: string,
    public readonly cashSessionId: string,
    public readonly customerId: string | undefined,
    public readonly items: SaleItemInput[],
    public readonly payments: SalePaymentInput[],
    public readonly discountType?: string,
    public readonly discountRate?: number,
    public readonly discountAmount?: number,
  ) {}
}
