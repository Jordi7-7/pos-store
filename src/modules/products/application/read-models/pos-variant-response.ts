import { AttributeValue } from '../../domain/entities/attribute-value.entity';
import { ProductType } from '../../domain/enums/product-type.enum';

/** Variante encontrada por SKU o código de barras para vender en el POS. */
export interface PosVariantResponse {
  id: string;
  sku: string;
  barcode: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice: number | null;
  productName: string;
  productType: ProductType;
  stock: number;
  attributes: Array<{ name: string; value: string }>;
  attributeValues: AttributeValue[];
  imageUrl: string | null;
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
