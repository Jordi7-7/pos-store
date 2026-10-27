export class GetMyCashRegistersQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly isOwner: boolean,
    public readonly branchId?: string,
  ) {}
}
