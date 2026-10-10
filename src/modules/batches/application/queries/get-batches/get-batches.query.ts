export class GetBatchesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly branchId?: string,
    public readonly startDateStr?: string,
    public readonly endDateStr?: string,
    public readonly search?: string,
    public readonly page = 1,
    public readonly limit = 10,
    public readonly userId?: string,
    public readonly userRole?: string,
  ) {}
}
