export class GetMyCashRegistersQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly userRole: string,
    public readonly branchId?: string,
  ) {}
}
