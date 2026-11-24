/**
 * Estado de existencias para filtrar el listado de productos. Se evalúa sobre las filas de stock de las variantes del
 * producto (de la sucursal pedida, o de todas si no se pide una). Una variante sin fila de stock cuenta como cero.
 */
export enum StockStatus {
  /** Alguna variante con existencia mayor que cero. */
  IN_STOCK = 'IN_STOCK',
  /** Ninguna variante con existencias, ni en positivo ni en negativo: todo en cero (o sin fila de stock). */
  ZERO = 'ZERO',
  /** Alguna variante con existencia menor que cero (se vendió más de lo que había). */
  NEGATIVE = 'NEGATIVE',
}
