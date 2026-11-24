export interface StockCountSheetItem {
  variantId: string;
  sku: string;
  productName: string;
  /** Existencia que el sistema tiene en la sucursal ahora. */
  stock: number;
  purchasePrice: number;
}

/** Página de variantes de una sucursal para armar un conteo físico. */
export interface StockCountSheetPage {
  items: StockCountSheetItem[];
  /** SKU desde el que pedir la página siguiente; `null` cuando no hay más. */
  nextAfter: string | null;
}
