export class CancelPurchaseOrderCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly purchaseOrderId: string,
  ) {}
}
