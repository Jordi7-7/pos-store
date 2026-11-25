import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';

export interface InventoryDocumentLineResult {
  variantId: string;
  sku: string;
  quantity: number;
  /** Si la línea sumó (`IN`) o restó (`OUT`) stock; un conteo mezcla ambas. */
  type: InventoryMovementType;
}

/** Documento de inventario ya registrado, con sus líneas. */
export interface InventoryDocumentResult {
  id: string;
  number: string;
  kind: InventoryDocumentKind;
  reason: string;
  comment: string | null;
  branchId: string;
  /** Solo en traslados: la sucursal que recibe (`branchId` es la que envía). */
  destinationBranchId: string | null;
  createdAt: Date;
  lines: InventoryDocumentLineResult[];
}

/** Una línea del kardex de un documento, con el costo y el saldo con los que quedó. */
export interface InventoryDocumentDetailLine {
  variantId: string;
  sku: string;
  productName: string;
  /** Si la línea sumó (`IN`) o restó (`OUT`) stock. */
  type: InventoryMovementType;
  quantity: number;
  /** La sucursal donde se movió el stock. */
  branchName: string | null;
  unitCost: number | null;
  balanceAfter: number | null;
}

/** Un documento de inventario con su cabecera completa y todas sus líneas, para abrirlo desde el historial. */
export interface InventoryDocumentDetail {
  id: string;
  number: string;
  kind: InventoryDocumentKind;
  reason: string;
  comment: string | null;
  createdAt: Date;
  userName: string | null;
  branch: { id: string; name: string };
  /** Solo en traslados: la sucursal que recibe (`branch` es la que envía). */
  destinationBranch: { id: string; name: string } | null;
  lines: InventoryDocumentDetailLine[];
}

/** Una fila de la lista de documentos de inventario, con cuántos productos y unidades movió. */
export interface InventoryDocumentListItem {
  id: string;
  number: string;
  kind: InventoryDocumentKind;
  reason: string;
  comment: string | null;
  createdAt: Date;
  userName: string | null;
  branch: { id: string; name: string };
  /** Solo en traslados: la sucursal que recibe (`branch` es la que envía). */
  destinationBranch: { id: string; name: string } | null;
  /** Productos (variantes) distintos del documento. */
  productsCount: number;
  /** Unidades movidas: en un traslado se cuentan una sola vez (no la salida y la entrada) y en un conteo, las diferencias. */
  unitsCount: number;
}

export interface InventoryDocumentListPage {
  data: InventoryDocumentListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
