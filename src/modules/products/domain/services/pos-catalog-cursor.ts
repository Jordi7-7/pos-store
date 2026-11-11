/**
 * Cursor del catálogo del POS: `<fecha de cambio con microsegundos>|<id de la variante>`. La fecha conserva los
 * microsegundos de Postgres (una importación masiva da la misma fecha a miles de filas: con milisegundos la
 * página nunca avanzaría) y el id desempata. Es opaco para el cliente: lo guarda y lo devuelve tal cual.
 */
export interface PosCatalogCursor {
  changedAt: string;
  id: string;
}

const CURSOR_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function formatPosCatalogCursor(cursor: PosCatalogCursor): string {
  return `${cursor.changedAt}|${cursor.id}`;
}

/** Devuelve `null` si no hay cursor (primera descarga) o si no tiene el formato esperado. */
export function parsePosCatalogCursor(raw: string | undefined | null): PosCatalogCursor | null {
  const match = raw ? CURSOR_PATTERN.exec(raw.trim()) : null;
  return match ? { changedAt: match[1], id: match[2].toLowerCase() } : null;
}

export const DEFAULT_CATALOG_PAGE = 1000;
export const MAX_CATALOG_PAGE = 2000;

export function parseCatalogPageSize(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_CATALOG_PAGE;
  return Math.min(parsed, MAX_CATALOG_PAGE);
}
