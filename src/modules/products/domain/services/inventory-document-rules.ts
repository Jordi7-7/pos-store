import { addQuantities } from '../../../../common/domain/quantity';
import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';
import { InventoryMovementReason } from '../../../../common/enums/inventory-movement-reason.enum';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';

/** Tope de líneas por documento: más allá, una transacción tan larga bloquea demasiadas filas de stock. */
export const MAX_DOCUMENT_LINES = 200;

/**
 * Motivos que el usuario puede elegir en cada tipo de documento. Solo las entradas y salidas manuales dejan elegir:
 * el conteo y el traslado llevan un único motivo que pone el sistema. `OTRO` vale en las dos direcciones.
 */
export const MANUAL_REASONS: Record<InventoryDocumentKind, readonly InventoryMovementReason[]> = {
  [InventoryDocumentKind.ENTRY]: [InventoryMovementReason.DONACION, InventoryMovementReason.PRODUCCION, InventoryMovementReason.OTRO],
  [InventoryDocumentKind.EXIT]: [
    InventoryMovementReason.MERMA,
    InventoryMovementReason.PERDIDA,
    InventoryMovementReason.USO_INTERNO,
    InventoryMovementReason.DEVOLUCION_PROVEEDOR,
    InventoryMovementReason.OTRO,
  ],
  [InventoryDocumentKind.COUNT]: [InventoryMovementReason.CONTEO_FISICO],
  [InventoryDocumentKind.TRANSFER]: [InventoryMovementReason.TRASLADO],
};

/** Mínimo de caracteres (sin espacios sobrantes) de un comentario obligatorio: evita un «.» o un «ok» para salir del paso, pero deja pasar «robo», «roto» o «daño». */
export const MIN_COMMENT_LENGTH = 4;

/** Prefijo del número de cada tipo de documento (`ENT-000001`, `SAL-000001`). */
export const DOCUMENT_PREFIX: Record<InventoryDocumentKind, string> = {
  [InventoryDocumentKind.ENTRY]: 'ENT',
  [InventoryDocumentKind.EXIT]: 'SAL',
  [InventoryDocumentKind.COUNT]: 'CNT',
  [InventoryDocumentKind.TRANSFER]: 'TRS',
};

/** Solo los motivos que el usuario elige a mano en ese tipo de documento (sin el `ADJUSTMENT` heredado). */
export function isManualReason(kind: InventoryDocumentKind, reason: string): boolean {
  const allowed: readonly string[] = MANUAL_REASONS[kind];
  return allowed.includes(reason);
}

const OTHER_REASON: string = InventoryMovementReason.OTRO;

/**
 * ¿Este documento exige comentario? Toda salida manual (es mercancía que sale sin venta, donde se controla el fraude)
 * y cualquier `OTRO`, porque sin comentario no dice nada. Las entradas con motivo propio, los conteos y los traslados no.
 */
export function isCommentRequired(kind: InventoryDocumentKind, reason: string): boolean {
  return kind === InventoryDocumentKind.EXIT || reason === OTHER_REASON;
}

/** ¿El comentario escrito cumple lo mínimo exigido? */
export function hasValidComment(comment: string | undefined | null): boolean {
  return (comment?.trim().length ?? 0) >= MIN_COMMENT_LENGTH;
}

/** Cantidad total por variante: si una variante aparece en varias líneas, se suman. */
export function totalsByVariant(items: readonly { variantId: string; quantity: number }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { variantId, quantity } of items) totals.set(variantId, addQuantities(totals.get(variantId) ?? 0, quantity));
  return totals;
}

/** Dos totales por variante son iguales si tienen las mismas variantes con las mismas cantidades. */
export function sameTotals(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  return a.size === b.size && [...b].every(([variantId, quantity]) => a.get(variantId) === quantity);
}

/** Permiso que exige cada tipo de documento de entrada/salida: quien puede sacar mercancía no necesariamente puede meterla. */
export function permissionForDocumentKind(kind: InventoryDocumentKind.ENTRY | InventoryDocumentKind.EXIT): string {
  return kind === InventoryDocumentKind.ENTRY ? APP_PERMISSIONS.PRODUCTS_STOCK_ENTRY : APP_PERMISSIONS.PRODUCTS_STOCK_EXIT;
}

export function formatDocumentNumber(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

export interface DocumentLine {
  variantId: string;
  quantity: number;
  /** Solo en entradas: costo de esta mercancía. Si falta, se usa el costo de compra de la variante. */
  unitCost?: number;
}

/**
 * Junta las líneas repetidas: la misma variante con el mismo costo se suma (un conteo no debe romper por un
 * duplicado). Costos distintos de la misma variante quedan como líneas separadas, porque son capas FIFO distintas.
 * Devuelve las líneas ordenadas por variante, el orden fijo con el que se bloquean las filas de stock.
 */
export function mergeDocumentLines(lines: readonly DocumentLine[]): DocumentLine[] {
  const merged = new Map<string, DocumentLine>();
  for (const line of lines) {
    const key = `${line.variantId}|${line.unitCost ?? ''}`;
    const existing = merged.get(key);
    if (existing) existing.quantity = addQuantities(existing.quantity, line.quantity);
    else merged.set(key, { ...line });
  }
  return [...merged.values()].sort((a, b) => a.variantId.localeCompare(b.variantId) || (a.unitCost ?? 0) - (b.unitCost ?? 0));
}
