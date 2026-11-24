import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';
import { InventoryMovementCategory } from '../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';

/** Una fila del historial global de movimientos de inventario (kardex). */
export interface InventoryMovementHistoryItem {
  id: string;
  createdAt: Date;
  /** Dirección: si suma (`IN`) o resta (`OUT`) stock. */
  type: InventoryMovementType;
  /** Clase de operación; nula solo en filas escritas por una versión anterior de la API. */
  category: InventoryMovementCategory | null;
  reason: string;
  quantity: number;
  /** Costo unitario con el que se movió y existencia tras el movimiento; nulos en filas anteriores. */
  unitCost: number | null;
  balanceAfter: number | null;
  variantId: string;
  sku: string;
  productName: string;
  originBranch: { id: string; name: string } | null;
  destinationBranch: { id: string; name: string } | null;
  purchaseOrderId: string | null;
  /** Documento manual al que pertenece (entrada/salida), con su número, comentario y quién lo hizo. */
  document: { id: string; number: string; comment: string | null; userName: string | null; kind: InventoryDocumentKind; counterpartBranchName: string | null } | null;
}

export interface InventoryMovementHistoryPage {
  data: InventoryMovementHistoryItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
