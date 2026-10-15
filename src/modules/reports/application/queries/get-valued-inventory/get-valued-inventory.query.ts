export class GetValuedInventoryQuery {
  constructor(
    public readonly tenantId: string,
    public readonly page?: number,
    public readonly limit?: number,
    public readonly branchId?: string,
    public readonly userId?: string,
    public readonly userRole?: string,
  ) {}
}
