/**
 * All possible values for the `reason` field in the `inventory_movements` table (Kardex).
 * Used to classify every stock movement for reporting and auditing purposes.
 */
export enum InventoryMovementReason {
  // ── Entradas (IN) ──────────────────────────────────────────────────────────

  /** Stock asignado al crear un producto o variante por primera vez. */
  INITIAL_STOCK = 'INITIAL_STOCK',

  /** Ingreso de mercancía por orden de compra a proveedor. */
  COMPRA = 'COMPRA',

  /** Reingreso de mercancía por devolución de un cliente. */
  DEVOLUCION = 'DEVOLUCION',

  // ── Salidas (OUT) o ajustes bidireccionales ─────────────────────────────────

  /** Salida de stock por venta a un cliente. Afecta el costo de ventas. */
  VENTA = 'VENTA',

  /**
   * Reversión de un ingreso de compra erróneo.
   * NO es una pérdida: el lote se deshace limpiamente, sin impacto en resultados.
   */
  ANULACION_COMPRA = 'ANULACION_COMPRA',

  /**
   * Ajuste manual de inventario (puede ser IN u OUT).
   * El motivo específico del ajuste (robo, daño, caducidad, uso interno,
   * corrección de conteo físico, etc.) debe describirse en el campo `comment`.
   */
  ADJUSTMENT = 'ADJUSTMENT',
}
