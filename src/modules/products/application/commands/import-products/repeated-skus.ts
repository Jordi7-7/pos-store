/**
 * SKUs que aparecen más de una vez en la lista (recortados, sin repetir en el resultado). La
 * comparación es exacta, igual que el índice único de la base de datos: "abc" y "ABC" son distintos.
 */
export function repeatedSkus(skus: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const raw of skus) {
    const sku = raw.trim();
    if (seen.has(sku)) {
      repeated.add(sku);
    } else {
      seen.add(sku);
    }
  }
  return [...repeated];
}
