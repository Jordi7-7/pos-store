import { InventoryMovementCategory } from '../../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';

export class GetInventoryMovementsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | undefined,
    public readonly isOwner: boolean | undefined,
    public readonly filters: {
      page: number;
      limit: number;
      branchId?: string;
      type?: InventoryMovementType;
      category?: InventoryMovementCategory;
      reason?: string;
      variantId?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {}
}
