import { ImportProductItemDto } from './import-products.dto';

export class ImportProductsCommand {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string | undefined,
    public readonly items: ImportProductItemDto[],
  ) {}
}
