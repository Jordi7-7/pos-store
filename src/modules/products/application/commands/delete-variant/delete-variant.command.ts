export class DeleteVariantCommand {
  constructor(
    public readonly tenantId: string,
    public readonly variantId: string,
  ) {}
}
