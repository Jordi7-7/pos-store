/**
 * Clase de operación de cada línea del kardex (`inventory_movements.category`): la única clasificación para filtrar y
 * analizar movimientos. Junto con la dirección (`type`: IN/OUT) dice qué pasó; el `reason` solo detalla los ajustes manuales.
 */
export enum InventoryMovementCategory {
  /** Stock con el que nace una variante (también el negativo al importar). */
  INITIAL = 'INITIAL',
  /** Entrada por compra a proveedor (IN) o su anulación (OUT). */
  PURCHASE = 'PURCHASE',
  /** Salida por venta a un cliente (OUT). */
  SALE = 'SALE',
  /** Reingreso por devolución de un cliente (IN). */
  RETURN = 'RETURN',
  /** Entrada o salida manual con motivo (donación, merma, pérdida…). */
  ADJUSTMENT = 'ADJUSTMENT',
  /** Diferencia hallada en un conteo físico (IN u OUT). */
  COUNT = 'COUNT',
  /** Traslado entre sucursales: OUT en el origen e IN en el destino. */
  TRANSFER = 'TRANSFER',
}
