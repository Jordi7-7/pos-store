import { ProductType } from '../../domain/enums/product-type.enum';
import { SelectorAttribute } from '../../domain/services/pos-variant-view';
import { PosSaleVariant } from './pos-variant-response';

/** Variante de un producto variable: además dice qué opción del selector usa en cada atributo. */
export interface PosVariableProductVariant extends PosSaleVariant {
  attributeValues: Array<{ attributeId: string; valueId: string }>;
}

/** Un producto variable encontrado por su SKU base en el POS: sus atributos y todas sus variantes para elegir una. */
export interface PosVariableProductResponse {
  productId: string;
  productName: string;
  productType: ProductType;
  baseSku: string | null;
  imageUrl: string | null;
  attributes: SelectorAttribute[];
  variants: PosVariableProductVariant[];
}
