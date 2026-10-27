export class GetActiveCashSessionQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly isOwner: boolean,
    public readonly branchId?: string,
    public readonly cashRegisterId?: string,
  ) {}
}
