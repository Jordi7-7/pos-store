export class GetCashSessionsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly branchId?: string,
    public readonly userId?: string,
    public readonly userRole?: string,
  ) {}
}
