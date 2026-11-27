import { ProductType } from './enums/product-type.enum';
import { normalizeSku } from './sku';

/**
 * A qué producto o variante pertenece una foto según el nombre de su archivo. Por orden: SKU de una variante, SKU base,
 * nombre del producto y nombre del producto seguido de los valores de la variante (`Mochila KTM 01`). Un final `_2` o `(2)`
 * marca otra foto de lo mismo y solo se quita si el nombre completo no coincide con nada.
 */

export interface MatchProduct {
  id: string;
  name: string;
  type: ProductType;
  baseSku: string | null;
}

export interface MatchVariant {
  id: string;
  productId: string;
  sku: string;
  attributeValues: readonly string[];
}

/** Destino de una foto. Un producto simple es siempre `PRODUCT` (su única variante comparte las fotos). */
export interface ImageTarget {
  kind: 'PRODUCT' | 'VARIANT';
  productId: string;
  variantId: string | null;
  productName: string;
  sku: string | null;
  attributes: string[];
}

export type FileMatchStatus = 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND';

export interface FileMatch {
  fileName: string;
  status: FileMatchStatus;
  /** Uno si coincide; varios (hasta `MAX_CANDIDATES`) si hay que elegir; ninguno si no se encontró. */
  candidates: ImageTarget[];
}

export const MAX_CANDIDATES = 10;

/** Sin tildes ni mayúsculas, y con cualquier signo convertido en un espacio. */
export const comparableName = (text: string): string =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** El nombre sin extensión y, si lo lleva, también sin el número de foto del final. */
export function fileStems(fileName: string): string[] {
  const stem = fileName.normalize('NFC').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  const withoutNumber = stem.replace(/(_\d{1,2}|\s*\(\d{1,2}\))$/, '').trim();
  return [...new Set([stem, withoutNumber])].filter(Boolean);
}

const sortedWords = (text: string): string => comparableName(text).split(' ').sort().join(' ');

export function createImageMatcher(products: readonly MatchProduct[], variants: readonly MatchVariant[]): (fileName: string) => FileMatch {
  const productById = new Map(products.map((product) => [product.id, product]));

  const productTarget = (product: MatchProduct): ImageTarget => ({
    kind: 'PRODUCT',
    productId: product.id,
    variantId: null,
    productName: product.name,
    sku: product.baseSku,
    attributes: [],
  });
  const variantTarget = (variant: MatchVariant): ImageTarget | null => {
    const product = productById.get(variant.productId);
    if (!product) return null;
    if (product.type === ProductType.SIMPLE) return productTarget(product);
    return { kind: 'VARIANT', productId: product.id, variantId: variant.id, productName: product.name, sku: variant.sku, attributes: [...variant.attributeValues] };
  };
  const fromVariants = (matches: readonly MatchVariant[]): ImageTarget[] => matches.map(variantTarget).filter((target): target is ImageTarget => target !== null);

  const rules: Array<(stem: string) => ImageTarget[]> = [
    (stem) => fromVariants(variants.filter((variant) => normalizeSku(variant.sku) === normalizeSku(stem))),
    (stem) => products.filter((product) => product.baseSku && normalizeSku(product.baseSku) === normalizeSku(stem)).map(productTarget),
    (stem) => products.filter((product) => comparableName(product.name) === comparableName(stem)).map(productTarget),
    (stem) => {
      const name = comparableName(stem);
      return fromVariants(
        variants.filter((variant) => {
          const product = productById.get(variant.productId);
          if (!product || variant.attributeValues.length === 0) return false;
          const prefix = `${comparableName(product.name)} `;
          return name.startsWith(prefix) && sortedWords(name.slice(prefix.length)) === sortedWords(variant.attributeValues.join(' '));
        }),
      );
    },
  ];

  return (fileName) => {
    for (const stem of fileStems(fileName)) {
      for (const rule of rules) {
        const found = rule(stem);
        const candidates = [...new Map(found.map((target) => [target.variantId ?? target.productId, target])).values()];
        if (candidates.length === 0) continue;
        return { fileName, status: candidates.length === 1 ? 'MATCHED' : 'AMBIGUOUS', candidates: candidates.slice(0, MAX_CANDIDATES) };
      }
    }
    return { fileName, status: 'NOT_FOUND', candidates: [] };
  };
}
