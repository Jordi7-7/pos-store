export class CreateVariantCommand {
  constructor(
    public readonly tenantId: string,
    public readonly productId: string,
    public readonly variantDto: any,
  ) {}
}
