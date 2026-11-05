import { normalizeSku } from '../../../domain/sku';

/**
 * SKUs que aparecen más de una vez en la lista (normalizados: sin espacios y en mayúsculas, sin
 * repetir en el resultado). "abc" y "ABC" son el mismo SKU.
 */
export function repeatedSkus(skus: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const raw of skus) {
    const sku = normalizeSku(raw);
    if (seen.has(sku)) {
      repeated.add(sku);
    } else {
      seen.add(sku);
    }
  }
  return [...repeated];
}
