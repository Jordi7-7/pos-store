export class UpdateSimpleProductCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly name?: string,
    public readonly description?: string,
    public readonly categoryId?: string | null,
    public readonly imageIds?: string[],
    public readonly sku?: string,
    public readonly barcode?: string,
    public readonly purchasePrice?: number,
    public readonly salePrice?: number,
    public readonly wholesalePrice?: number | null,
  ) {}
}
