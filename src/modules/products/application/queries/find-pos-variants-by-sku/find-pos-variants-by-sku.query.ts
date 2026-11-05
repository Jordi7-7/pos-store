export class FindPosVariantsBySkuQuery {
  constructor(
    public readonly tenantId: string,
    public readonly sku: string,
    public readonly branchId: string,
  ) {}
}
