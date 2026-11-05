import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';

export class AdjustStockCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly branchId: string,
    public readonly variantId: string,
    public readonly quantity: number,
    public readonly type: InventoryMovementType,
    public readonly comment?: string,
  ) {}
}
