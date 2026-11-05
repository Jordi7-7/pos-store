/**
 * Los clientes web a veces envían un filtro vacío como texto ("", "null" o "undefined"). Para el
 * servidor eso significa "sin filtro", no un identificador inválido.
 */
export function blankToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' || trimmed === 'null' || trimmed === 'undefined' ? undefined : trimmed;
}
