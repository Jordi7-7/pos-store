export class UpdateProductCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly name?: string,
    public readonly description?: string,
    public readonly imageIds?: string[],
    public readonly categoryId?: string,
    public readonly variants?: any[],
  ) {}
}
