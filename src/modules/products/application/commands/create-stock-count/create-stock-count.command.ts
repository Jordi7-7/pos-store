import { CountLine } from '../../../domain/services/stock-count-rules';

/** Conteo físico de varias variantes en una sucursal: corrige las existencias con lo contado. */
export class CreateStockCountCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | null,
    public readonly branchId: string,
    public readonly reason: string,
    public readonly lines: readonly CountLine[],
    public readonly comment?: string,
    /** Identificador del intento: reenviarlo no repite la operación. */
    public readonly clientRequestId?: string,
    /** Aplicar aunque el stock haya cambiado desde que el usuario lo vio (la diferencia se suma al stock actual). */
    public readonly acceptStockChanges = false,
  ) {}
}
