export interface ValidateProductItemInput {
  sku: string;
  name: string;
}

export class ValidateImportProductsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly items: ValidateProductItemInput[],
  ) {}
}
