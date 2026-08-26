import { ImportPurchaseItemDto } from './import-purchases.dto';

export class ImportPurchasesCommand {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string,
    public readonly items: ImportPurchaseItemDto[],
  ) {}
}
