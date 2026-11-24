/** Tipo de un documento de inventario manual: lo que entra o lo que sale de una sucursal. */
export enum InventoryDocumentKind {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
  /** Conteo físico: cada línea es una diferencia entre lo contado y lo que decía el sistema. */
  COUNT = 'COUNT',
  /** Traslado entre sucursales: sale del origen y entra al destino en la misma operación. */
  TRANSFER = 'TRANSFER',
}
