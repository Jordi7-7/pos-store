/** Existencias de una variante en una sucursal, para mostrarlas sin conexión (puede ser negativa: las ventas no se rechazan por stock). */
export interface PosStockItem {
  variantId: string;
  quantity: number;
}

export interface PosStockPage {
  items: PosStockItem[];
  /** Guardar tal cual y enviarlo como `after` en la siguiente descarga: solo llegan los cambios posteriores. */
  cursor: string | null;
  hasMore: boolean;
  serverTime: string;
}
