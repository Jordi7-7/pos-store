export interface ImportProductItemInput {
  sku: string;
  name: string;
  barcode?: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice?: number;
  quantity: number;
}

export class ImportProductsCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly branchId: string | undefined,
    public readonly items: ImportProductItemInput[],
  ) {}
}
