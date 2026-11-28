import { AttributeValue } from '../../domain/entities/attribute-value.entity';
import { ProductType } from '../../domain/enums/product-type.enum';

/** Lo que el POS necesita de una variante al escanear. Nunca lleva el precio de compra. */
export interface PosSaleVariant {
  id: string;
  sku: string;
  barcode: string;
  salePrice: number;
  wholesalePrice: number | null;
  /** Existencia en la sucursal pedida. */
  stock: number;
  attributes: Array<{ name: string; value: string }>;
  imageUrl: string | null;
}

/** Variante encontrada por SKU o código de barras para vender en el POS. */
export interface PosVariantResponse extends PosSaleVariant {
  productName: string;
  productType: ProductType;
}

/** Variante del listado del POS (sin código de barras ni imagen). */
export interface PosVariantListItem {
  id: string;
  sku: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice: number | null;
  productName: string;
  stock: number;
  attributeValues: AttributeValue[];
}

/** Búsqueda mínima por SKU (compras y catálogos). */
export interface VariantLookupResponse {
  id: string;
  sku: string;
  purchasePrice: number;
  productName: string;
}
