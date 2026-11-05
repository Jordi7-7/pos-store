export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

/** Página solicitada (≥ 1). Un valor ausente, no numérico o menor que 1 cae en la primera. */
export function parsePage(value: unknown): number {
  return positiveInteger(value) ?? 1;
}

/**
 * Tamaño de página solicitado, acotado a `MAX_PAGE_SIZE` para que un cliente no pueda
 * pedir tablas enteras. Un valor ausente o inválido usa el tamaño por defecto.
 */
export function parseLimit(value: unknown, defaultSize: number = DEFAULT_PAGE_SIZE): number {
  return Math.min(positiveInteger(value) ?? defaultSize, MAX_PAGE_SIZE);
}
