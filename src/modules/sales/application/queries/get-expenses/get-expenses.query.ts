export class GetExpensesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly cashSessionId?: string,
    public readonly userId?: string,
    public readonly isOwner?: boolean,
  ) {}
}
