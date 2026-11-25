import { InventoryDocumentKind } from '../../../../../common/enums/inventory-document-kind.enum';

export class GetInventoryDocumentsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | undefined,
    public readonly isOwner: boolean | undefined,
    public readonly filters: {
      page: number;
      limit: number;
      branchId?: string;
      kind?: InventoryDocumentKind;
      /** Número, comentario o SKU/código de barras de alguna de sus líneas. */
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {}
}
