export class GetExpensesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly cashSessionId?: string,
  ) {}
}
