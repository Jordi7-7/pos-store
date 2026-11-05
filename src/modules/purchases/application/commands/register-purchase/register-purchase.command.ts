export interface RegisterPurchaseItemInput {
  variantId: string;
  quantity: number;
  purchasePrice: number;
}

export class RegisterPurchaseCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly supplierId: string,
    public readonly branchId: string,
    public readonly invoiceNumber: string | null,
    public readonly items: RegisterPurchaseItemInput[],
  ) {}
}
