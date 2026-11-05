export interface ImportPurchaseItemInput {
  sku: string;
  quantity: number;
}

export class ImportPurchasesCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly branchId: string,
    public readonly items: ImportPurchaseItemInput[],
    public readonly invoiceNumber?: string,
    public readonly supplierId?: string,
  ) {}
}
