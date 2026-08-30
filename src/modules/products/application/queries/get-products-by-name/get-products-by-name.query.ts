export class GetProductsByNameQuery {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly page?: number,
    public readonly limit?: number,
  ) {}
}
