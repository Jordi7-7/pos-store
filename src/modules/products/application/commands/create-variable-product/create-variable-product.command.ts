import { VariantInput } from '../create-variant/create-variant.command';

export class CreateVariableProductCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
    public readonly description: string,
    public readonly variants: VariantInput[],
    public readonly imageIds?: string[],
    public readonly categoryId?: string,
    public readonly baseSku?: string,
  ) {}
}

