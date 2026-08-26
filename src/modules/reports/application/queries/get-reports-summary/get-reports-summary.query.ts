export class GetReportsSummaryQuery {
  constructor(
    public readonly tenantId: string,
    public readonly startDateStr?: string,
    public readonly endDateStr?: string,
  ) {}
}
