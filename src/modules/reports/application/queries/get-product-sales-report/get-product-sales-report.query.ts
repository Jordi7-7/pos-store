export class GetProductSalesReportQuery {
  constructor(
    public readonly tenantId: string,
    public readonly startDateStr?: string,
    public readonly endDateStr?: string,
    public readonly branchId?: string,
    public readonly userId?: string,
    public readonly isOwner?: boolean,
  ) {}
}
