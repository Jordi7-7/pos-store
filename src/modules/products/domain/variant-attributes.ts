/**
 * Coherencia de los atributos de las variantes de un producto: cada variante usa a lo sumo un valor por atributo y todas
 * usan el mismo conjunto de atributos (no «Talla» en una y «Color» en otra). Recibe, por variante, el atributo de cada valor.
 *
 * - `REPEATED`: una variante tiene dos valores del mismo atributo.
 * - `MIXED`: las variantes no usan los mismos atributos (incluye mezclar con y sin atributos).
 */
export type VariantAttributeProblem = 'REPEATED' | 'MIXED';

export function findVariantAttributeProblem(attributeIdsPerVariant: readonly (readonly string[])[]): VariantAttributeProblem | null {
  for (const attributeIds of attributeIdsPerVariant) {
    if (new Set(attributeIds).size !== attributeIds.length) return 'REPEATED';
  }
  const signatures = new Set(attributeIdsPerVariant.map((attributeIds) => [...attributeIds].sort().join(',')));
  return signatures.size > 1 ? 'MIXED' : null;
}
