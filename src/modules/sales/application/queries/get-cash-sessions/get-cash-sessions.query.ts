export class GetCashSessionsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly branchId?: string,
  ) {}
}
