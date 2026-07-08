export class RegisterPurchaseCommand {
  constructor(
    public readonly tenantId: string,
    public readonly supplierId: string,
    public readonly branchId: string,
    public readonly invoiceNumber: string | undefined,
    public readonly items: any[],
  ) {}
}
