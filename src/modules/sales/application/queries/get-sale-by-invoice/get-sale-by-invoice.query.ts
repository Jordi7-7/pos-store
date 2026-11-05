export class GetSaleByInvoiceQuery {
  constructor(
    public readonly tenantId: string,
    public readonly invoiceNumber: string,
    public readonly userId?: string,
    public readonly isOwner?: boolean,
  ) {}
}
