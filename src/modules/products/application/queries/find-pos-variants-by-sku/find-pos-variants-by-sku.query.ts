export class FindPosVariantsBySkuQuery {
  constructor(
    public readonly tenantId: string,
    public readonly sku: string,
    public readonly branchId: string,
    public readonly userId: string,
    public readonly isOwner: boolean,
  ) {}
}
