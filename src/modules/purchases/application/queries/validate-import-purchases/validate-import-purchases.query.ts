import { ValidatePurchaseItemDto } from '../../commands/import-purchases/import-purchases.dto';

export class ValidateImportPurchasesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly items: ValidatePurchaseItemDto[],
  ) {}
}
