export class DeleteProductCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
  ) {}
}
