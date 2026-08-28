export class GetInventoryMovementsByVariantQuery {
  constructor(
    public readonly tenantId: string,
    public readonly variantId: string,
    public readonly page = 1,
    public readonly limit = 10,
  ) {}
}
