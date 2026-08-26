export class UpdateVariantTagsCommand {
  constructor(
    public readonly tenantId: string,
    public readonly variantId: string,
    public readonly tagIds: string[],
  ) {}
}
