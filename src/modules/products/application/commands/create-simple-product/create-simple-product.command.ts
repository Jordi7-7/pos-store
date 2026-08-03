export class CreateSimpleProductCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly description: string,
    public readonly sku: string,
    public readonly barcode: string,
    public readonly purchasePrice: number,
    public readonly salePrice: number,
    public readonly categoryId?: string,
    public readonly imageIds?: string[],
    public readonly stocks?: { branchId: string; quantity: number }[],
  ) {}
}
