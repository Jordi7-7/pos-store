export interface ValidatePurchaseItemInput {
  sku: string;
  quantity: number;
}

export class ValidateImportPurchasesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly items: ValidatePurchaseItemInput[],
  ) {}
}
