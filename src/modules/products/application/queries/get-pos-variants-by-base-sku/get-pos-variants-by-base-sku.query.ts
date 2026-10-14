export class GetPosVariantsByBaseSkuQuery {
  constructor(
    public readonly tenantId: string,
    public readonly baseSku: string,
    public readonly branchId: string,
  ) {}
}
