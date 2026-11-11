import { ProductType } from '../../domain/enums/product-type.enum';

/** Una variante del catálogo que el POS guarda en el aparato para vender sin conexión. Sin stock ni imágenes. */
export interface PosCatalogItem {
  id: string;
  sku: string;
  barcode: string;
  productId: string;
  productName: string;
  productType: ProductType;
  baseSku: string | null;
  salePrice: number;
  wholesalePrice: number | null;
  attributes: Array<{ attributeId: string; attributeName: string; valueId: string; valueName: string }>;
  /** La variante (o su producto) se borró: el aparato debe quitarla de su copia. */
  deleted: boolean;
}

export interface PosCatalogPage {
  items: PosCatalogItem[];
  /** Guardar tal cual y enviarlo como `after` en la siguiente descarga: solo llegan los cambios posteriores. */
  cursor: string | null;
  /** Hay más páginas por pedir con este cursor. */
  hasMore: boolean;
  serverTime: string;
}
