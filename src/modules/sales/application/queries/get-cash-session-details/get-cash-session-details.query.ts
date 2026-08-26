export class GetCashSessionDetailsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly sessionId: string,
  ) {}
}
