export class RegisterPurchaseCommand {
  constructor(
    public readonly tenantId: string,
    public readonly supplierId: string,
    public readonly branchId: string,
    public readonly invoiceNumber: string | null,
    public readonly items: any[],
  ) {}
}
