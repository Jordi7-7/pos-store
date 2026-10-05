export class GetDashboardMetricsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly branchId?: string,
  ) {}
}
