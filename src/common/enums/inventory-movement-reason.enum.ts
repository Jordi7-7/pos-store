/**
 * Values of the `reason` field in the `inventory_movements` table (Kardex): the detail of a movement.
 * The classification used to filter and analyse is `InventoryMovementCategory`.
 *
 * Los motivos que el usuario puede ELEGIR a mano son pocos y están en `MANUAL_REASONS`
 * (`inventory-document-rules.ts`). Los demás los escribe el sistema (`VENTA`, `COMPRA`, `TRASLADO`…);
 * `ADJUSTMENT` queda solo para las filas del ajuste antiguo que ya hay en producción.
 */
export enum InventoryMovementReason {
  // ── Los escribe el sistema ─────────────────────────────────────────────────

  /** Stock asignado al crear un producto o variante por primera vez (también el negativo al importar). */
  INITIAL_STOCK = 'INITIAL_STOCK',

  /** Ingreso de mercancía por orden de compra a proveedor. */
  COMPRA = 'COMPRA',

  /** Reversión de un ingreso de compra erróneo. NO es una pérdida: el lote se deshace limpiamente. */
  ANULACION_COMPRA = 'ANULACION_COMPRA',

  /** Salida de stock por venta a un cliente. Afecta el costo de ventas. */
  VENTA = 'VENTA',

  /** Reingreso de mercancía por devolución de un cliente. */
  DEVOLUCION = 'DEVOLUCION',

  /** Diferencia hallada al contar físicamente la mercancía (conteo, puede sumar o restar). */
  CONTEO_FISICO = 'CONTEO_FISICO',

  /** Traslado entre sucursales: sale del origen y entra al destino. El usuario no elige motivo. */
  TRASLADO = 'TRASLADO',

  /** Ajuste manual del endpoint antiguo (ya retirado): solo existe en filas anteriores. */
  ADJUSTMENT = 'ADJUSTMENT',

  // ── Entradas manuales (documento ENT) ───────────────────────────────────────

  /** Mercancía recibida sin compra: regalo, muestra o donación. */
  DONACION = 'DONACION',

  /** Producto terminado que entra desde producción propia. */
  PRODUCCION = 'PRODUCCION',

  // ── Salidas manuales (documento SAL) ────────────────────────────────────────

  /** Mercancía dañada, deteriorada o vencida. */
  MERMA = 'MERMA',

  /** Robo o pérdida. */
  PERDIDA = 'PERDIDA',

  /** Consumo propio del negocio o muestras (no es venta). */
  USO_INTERNO = 'USO_INTERNO',

  /** Mercancía devuelta al proveedor. */
  DEVOLUCION_PROVEEDOR = 'DEVOLUCION_PROVEEDOR',

  // ── Entradas o salidas manuales ─────────────────────────────────────────────

  /** Otra entrada o salida manual: el detalle va en el comentario, que es obligatorio. */
  OTRO = 'OTRO',
}
