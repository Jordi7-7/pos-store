export class GetVariantBySkuQuery {
  constructor(
    public readonly tenantId: string,
    public readonly sku: string,
  ) {}
}
