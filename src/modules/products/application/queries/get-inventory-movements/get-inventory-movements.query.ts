export class GetInventoryMovementsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly variantId?: string,
  ) {}
}
