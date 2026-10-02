export class GetProductBatchesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly branchId?: string,
    public readonly search?: string,
    public readonly status?: 'all' | 'active' | 'exhausted',
    public readonly page = 1,
    public readonly limit = 10,
  ) {}
}
