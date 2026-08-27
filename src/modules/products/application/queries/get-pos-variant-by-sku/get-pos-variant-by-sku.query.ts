export class GetPosVariantBySkuQuery {
  constructor(
    public readonly tenantId: string,
    public readonly sku: string,
    public readonly branchId: string,
  ) {}
}
