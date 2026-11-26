import { ProductType } from '../../domain/enums/product-type.enum';

/** Un producto variable encontrado por su SKU base en el POS: sus atributos y todas sus variantes para elegir una. */
export interface PosVariableProductOptionValue {
  id: string;
  value: string;
}

export interface PosVariableProductAttribute {
  id: string;
  name: string;
  values: PosVariableProductOptionValue[];
}

export interface PosVariableProductResponse {
  productId: string;
  productName: string;
  productType: ProductType;
  baseSku: string | null;
  description?: string;
  imageUrl?: string | null;
  attributes: PosVariableProductAttribute[];
  variants: Array<{
    id: string;
    sku: string;
    barcode: string;
    purchasePrice: number;
    salePrice: number;
    wholesalePrice: number | null;
    stock: number;
    imageUrl?: string | null;
    attributes: Array<{
      name: string;
      value: string;
    }>;
    attributeValues: Array<{
      attributeId: string;
      attributeName: string;
      valueId: string;
      valueName: string;
    }>;
  }>;
}
