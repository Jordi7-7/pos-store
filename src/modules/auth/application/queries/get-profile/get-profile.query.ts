export class GetProfileQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
  ) {}
}
