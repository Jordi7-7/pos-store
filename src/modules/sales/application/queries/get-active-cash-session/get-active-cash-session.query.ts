export class GetActiveCashSessionQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly userRole: string,
    public readonly branchId?: string,
    public readonly cashRegisterId?: string,
  ) {}
}
