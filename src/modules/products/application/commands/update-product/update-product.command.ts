export class UpdateProductCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly name?: string,
    public readonly description?: string,
  ) {}
}
