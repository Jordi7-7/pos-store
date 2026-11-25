import { normalizeSku } from './sku';

/** Una fila del archivo de importación: una variante (o un producto simple si no trae atributos). */
export interface ImportRow {
  /** Número de fila en el archivo (para señalar los errores). */
  row: number;
  name: string;
  baseSku: string;
  category: string;
  attributes: ReadonlyArray<{ name: string; value: string }>;
  sku: string;
  barcode: string;
  purchasePrice: number | null;
  salePrice: number | null;
  wholesalePrice: number | null;
  quantity: number | null;
}

export type ImportField = 'name' | 'baseSku' | 'category' | 'attributes' | 'sku' | 'barcode' | 'purchasePrice' | 'salePrice' | 'wholesalePrice' | 'quantity';

export interface ImportRowError {
  row: number;
  field: ImportField;
  message: string;
}

export interface PlannedVariant {
  row: number;
  sku: string;
  barcode: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice: number | null;
  quantity: number;
  attributes: ReadonlyArray<{ name: string; value: string }>;
}

export interface PlannedProduct {
  kind: 'SIMPLE' | 'VARIABLE';
  name: string;
  /** SKU base normalizado (en un producto simple es el SKU de su única variante). */
  baseSku: string;
  category: string | null;
  variants: PlannedVariant[];
}

export interface ImportPlan {
  products: PlannedProduct[];
  errors: ImportRowError[];
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const key = (text: string): string => text.trim().toLowerCase();

/**
 * Agrupa las filas en productos y valida todo lo que no necesita la base de datos. Las filas con el mismo SKU base forman un
 * producto con variantes; una fila sin atributos y sin SKU base es un producto simple. Devuelve el plan y TODOS los errores
 * encontrados (no solo el primero), cada uno con su fila, para corregir el archivo de una vez.
 */
export function planImport(rows: readonly ImportRow[]): ImportPlan {
  const errors: ImportRowError[] = [];
  const fail = (row: ImportRow, field: ImportField, message: string) => errors.push({ row: row.row, field, message });

  // 1) Campos de cada fila
  for (const row of rows) {
    if (!row.name.trim()) fail(row, 'name', 'Falta el nombre del producto.');
    if (!row.sku.trim()) fail(row, 'sku', 'Falta el SKU.');
    if (row.salePrice === null || row.salePrice <= 0) fail(row, 'salePrice', row.salePrice !== null && row.salePrice < 0 ? 'El precio de venta no puede ser negativo.' : 'Falta el precio de venta.');
    if (row.purchasePrice !== null && row.purchasePrice < 0) fail(row, 'purchasePrice', 'El precio de compra no puede ser negativo.');
    if (row.wholesalePrice !== null && row.wholesalePrice < 0) fail(row, 'wholesalePrice', 'El precio de mayoreo no puede ser negativo.');
    if (row.quantity !== null && row.quantity < 0) fail(row, 'quantity', 'La existencia no puede ser negativa.');

    const names = row.attributes.map((attribute) => key(attribute.name));
    if (row.attributes.some((attribute) => !attribute.name.trim() || !attribute.value.trim())) fail(row, 'attributes', 'Cada atributo necesita su nombre y su valor.');
    else if (new Set(names).size !== names.length) fail(row, 'attributes', 'Un atributo está repetido en la misma fila.');
  }

  // 2) SKU repetidos dentro del archivo
  const firstRowOfSku = new Map<string, number>();
  for (const row of rows) {
    const sku = normalizeSku(row.sku);
    if (!sku) continue;
    const first = firstRowOfSku.get(sku);
    if (first === undefined) firstRowOfSku.set(sku, row.row);
    else fail(row, 'sku', `El SKU ${sku} ya aparece en la fila ${first}.`);
  }

  // 3) Productos: filas con el mismo SKU base (o, sin SKU base, cada fila sin atributos es el suyo)
  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) {
    const groupKey = normalizeSku(row.baseSku) || (row.attributes.length === 0 ? normalizeSku(row.sku) : '');
    if (!groupKey) {
      if (row.sku.trim()) fail(row, 'baseSku', 'Falta el SKU base: las variantes de un mismo producto lo comparten.');
      continue;
    }
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
  }

  const products: PlannedProduct[] = [];
  for (const [baseSku, members] of groups) {
    const [first] = members;
    if (!first) continue;
    const hasAttributes = members.some((member) => member.attributes.length > 0);
    const isSimple = !hasAttributes;

    if (isSimple && members.length > 1) {
      for (const member of members.slice(1)) fail(member, 'baseSku', `Comparte el SKU base ${baseSku} con la fila ${first.row} pero no tiene atributos: añade talla, color u otro atributo para que sean variantes.`);
      continue;
    }

    for (const member of members.slice(1)) {
      if (!same(member.name, first.name)) fail(member, 'name', `El nombre no coincide con el de la fila ${first.row} (mismo SKU base ${baseSku}).`);
      if (!same(member.category, first.category)) fail(member, 'category', `La categoría no coincide con la de la fila ${first.row} (mismo SKU base ${baseSku}).`);
    }

    if (hasAttributes) {
      const expected = [...new Set(first.attributes.map((attribute) => key(attribute.name)))].sort().join(',');
      const seen = new Map<string, number>();
      for (const member of members) {
        const own = [...new Set(member.attributes.map((attribute) => key(attribute.name)))].sort().join(',');
        if (own !== expected) {
          fail(member, 'attributes', member.attributes.length === 0 ? `Falta indicar los atributos: las demás variantes de ${baseSku} los tienen.` : `Usa otros atributos que la fila ${first.row}: todas las variantes de un producto deben usar los mismos.`);
          continue;
        }
        const combination = member.attributes.map((attribute) => `${key(attribute.name)}=${key(attribute.value)}`).sort().join('|');
        const previous = seen.get(combination);
        if (previous === undefined) seen.set(combination, member.row);
        else fail(member, 'attributes', `Tiene la misma combinación de atributos que la fila ${previous}.`);
      }
    }

    products.push({
      kind: isSimple ? 'SIMPLE' : 'VARIABLE',
      name: first.name.trim(),
      baseSku: isSimple ? normalizeSku(first.sku) : baseSku,
      category: first.category.trim() || null,
      variants: members.map((member) => ({
        row: member.row,
        sku: normalizeSku(member.sku),
        barcode: member.barcode.trim(),
        purchasePrice: member.purchasePrice ?? 0,
        salePrice: member.salePrice ?? 0,
        wholesalePrice: member.wholesalePrice,
        quantity: member.quantity ?? 0,
        attributes: member.attributes.map((attribute) => ({ name: attribute.name.trim(), value: attribute.value.trim() })),
      })),
    });
  }

  // 4) Un SKU base de producto con variantes no puede ser el SKU de una variante de otro producto (el POS no lo encontraría)
  const variableBases = new Map(products.filter((product) => product.kind === 'VARIABLE').map((product) => [product.baseSku, product]));
  for (const product of products) {
    for (const variant of product.variants) {
      const clash = variableBases.get(variant.sku);
      if (clash && clash !== product) {
        const owner = rows.find((candidate) => candidate.row === variant.row) as ImportRow;
        fail(owner, 'sku', `El SKU ${variant.sku} es el SKU base de otro producto del archivo.`);
      }
    }
  }

  return { products, errors: errors.sort((a, b) => a.row - b.row) };
}
