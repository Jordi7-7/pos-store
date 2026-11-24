import { DocumentLine } from '../../../domain/services/inventory-document-rules';

/** Traslado de varias variantes de una sucursal a otra: sale del origen y entra al destino en la misma operación. */
export class CreateStockTransferCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly originBranchId: string,
    public readonly destinationBranchId: string,
    public readonly reason: string,
    public readonly lines: readonly Pick<DocumentLine, 'variantId' | 'quantity'>[],
    public readonly comment?: string,
    /** Identificador del intento: reenviarlo no repite la operación. */
    public readonly clientRequestId?: string,
  ) {}
}
