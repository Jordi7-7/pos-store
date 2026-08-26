export class GetSalesCostReportQuery {
  constructor(
    public readonly tenantId: string,
    public readonly startDateStr?: string,
    public readonly endDateStr?: string,
  ) {}
}
