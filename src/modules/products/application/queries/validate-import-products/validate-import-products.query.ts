import { ValidateProductItemDto } from '../../commands/import-products/import-products.dto';

export class ValidateImportProductsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly items: ValidateProductItemDto[],
  ) {}
}
