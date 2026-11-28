/** Una opción elegida por una variante («Base: Negro»). */
export interface VariantOption {
  id: string;
  attributeId: string;
  value: string;
  sortOrder: number;
  createdAt: Date;
  attribute?: { name: string } | null;
}

/** Un atributo del selector, con las opciones que usan las variantes del producto. */
export interface SelectorAttribute {
  id: string;
  name: string;
  values: Array<{ id: string; value: string }>;
}

const compareText = (a: string, b: string): number => a.localeCompare(b, 'es', { numeric: true });

export const optionAttributeName = (option: VariantOption): string => option.attribute?.name ?? 'Atributo';

/** Por SKU leyendo los números como números: «X-2» va antes que «X-10». */
export function sortBySku<T extends { sku: string }>(variants: readonly T[]): T[] {
  return [...variants].sort((a, b) => compareText(a.sku, b.sku));
}

/** La combinación de una variante, siempre en el mismo orden (por nombre del atributo). */
export function sortCombination<T extends VariantOption>(options: readonly T[]): T[] {
  return [...options].sort((a, b) => compareText(optionAttributeName(a), optionAttributeName(b)));
}

/** El orden configurado en el atributo y, a igualdad, el de creación (igual que en el catálogo de atributos). */
const compareOptions = (a: VariantOption, b: VariantOption): number =>
  a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime() || compareText(a.id, b.id);

/**
 * Los atributos para elegir una variante: primero el que tiene más opciones (el que más separa las variantes) y,
 * a igualdad, por nombre. Cada uno trae solo las opciones que usa alguna variante.
 */
export function buildSelectorAttributes(combinations: ReadonlyArray<readonly VariantOption[]>): SelectorAttribute[] {
  const attributes = new Map<string, { name: string; options: Map<string, VariantOption> }>();
  for (const option of combinations.flat()) {
    const attribute = attributes.get(option.attributeId) ?? { name: optionAttributeName(option), options: new Map<string, VariantOption>() };
    attribute.options.set(option.id, option);
    attributes.set(option.attributeId, attribute);
  }
  return [...attributes.entries()]
    .sort(([, a], [, b]) => b.options.size - a.options.size || compareText(a.name, b.name))
    .map(([id, { name, options }]) => ({
      id,
      name,
      values: [...options.values()].sort(compareOptions).map((option) => ({ id: option.id, value: option.value })),
    }));
}
