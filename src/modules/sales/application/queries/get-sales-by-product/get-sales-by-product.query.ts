export class GetSalesByProductQuery {
  constructor(
    public readonly tenantId: string,
    public readonly productId: string,
    public readonly page = 1,
    public readonly limit = 10,
  ) {}
}
