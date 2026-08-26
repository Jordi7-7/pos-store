export class CancelPurchaseOrderCommand {
  constructor(
    public readonly tenantId: string,
    public readonly purchaseOrderId: string,
  ) {}
}
