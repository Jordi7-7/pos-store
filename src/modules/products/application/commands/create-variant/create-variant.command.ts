export interface VariantInput {
  sku: string;
  barcode?: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice?: number | null;
  imageIds?: string[];
  attributeValues?: Array<{ attributeValueId: string }>;
  stocks?: Array<{ branchId: string; quantity: number }>;
}

export class CreateVariantCommand {
  constructor(
    public readonly tenantId: string,
    public readonly productId: string,
    public readonly variantDto: VariantInput,
  ) {}
}
