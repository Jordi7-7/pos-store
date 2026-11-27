import { VariantInput } from '../../../domain/variant-input';

export type { VariantInput };

export class CreateVariantCommand {
  constructor(
    public readonly tenantId: string,
    public readonly productId: string,
    public readonly variantDto: VariantInput,
  ) {}
}
