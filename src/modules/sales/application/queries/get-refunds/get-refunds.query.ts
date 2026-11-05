export class GetRefundsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly cashSessionId?: string,
    public readonly saleId?: string,
    public readonly userId?: string,
    public readonly isOwner?: boolean,
  ) {}
}
