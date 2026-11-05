/**
 * Patrón `%término%` para LIKE/ILIKE con los comodines del usuario neutralizados: sin esto, buscar
 * "%" o "_" coincide con todo y un término con "\\" rompe el patrón. Postgres usa "\\" como escape.
 */
export function containsPattern(term: string): string {
  const escaped = term.trim().replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}
