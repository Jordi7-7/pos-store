export class GetCashSessionDetailsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly sessionId: string,
    public readonly userId?: string,
    public readonly isOwner?: boolean,
  ) {}
}
