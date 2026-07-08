export class GetProductByIdQuery {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
  ) {}
}
