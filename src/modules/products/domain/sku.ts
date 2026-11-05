/**
 * Regla única del SKU en todo el sistema: sin espacios en los extremos y en MAYÚSCULAS. Así "cam-1",
 * " CAM-1 " y "Cam-1" son el mismo SKU al guardar, al buscar, al importar y al escanear.
 */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}
