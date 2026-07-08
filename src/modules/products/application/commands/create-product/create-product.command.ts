export class CreateProductCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly description: string,
    public readonly variants: any[],
  ) {}
}
