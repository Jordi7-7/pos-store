export class GetSaleByInvoiceQuery {
  constructor(
    public readonly tenantId: string,
    public readonly invoiceNumber: string,
  ) {}
}
