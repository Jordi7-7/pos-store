import { InventoryDocumentKind } from '../../../../../common/enums/inventory-document-kind.enum';
import { DocumentLine } from '../../../domain/services/inventory-document-rules';

/** Entrada o salida manual de varias variantes en una sola sucursal, registrada como un documento. */
export class CreateInventoryDocumentCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly branchId: string,
    public readonly kind: InventoryDocumentKind,
    public readonly reason: string,
    public readonly lines: readonly DocumentLine[],
    public readonly comment?: string,
    /** Identificador del intento: reenviarlo no repite la operación. */
    public readonly clientRequestId?: string,
  ) {}
}
