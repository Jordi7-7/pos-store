export class UpdateVariantCommand {
  constructor(
    public readonly tenantId: string,
    public readonly variantId: string,
    public readonly sku?: string,
    public readonly barcode?: string,
    public readonly purchasePrice?: number,
    public readonly salePrice?: number,
    public readonly wholesalePrice?: number | null,
    public readonly imageIds?: string[],
  ) {}
}
