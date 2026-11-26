/** Qué está mal en una lista de opciones enviada para ordenar un atributo; `null` si es válida. */
export type OrderProblem = 'DUPLICATED' | 'UNKNOWN' | 'MISSING';

/**
 * La lista debe traer exactamente las opciones vigentes del atributo, cada una una vez. Si falta una (alguien la creó
 * mientras se ordenaba) o sobra una (la eliminaron), quien ordenó vio una lista vieja y debe recargarla.
 */
export function findOrderProblem(currentIds: readonly string[], requestedIds: readonly string[]): OrderProblem | null {
  if (new Set(requestedIds).size !== requestedIds.length) return 'DUPLICATED';
  const current = new Set(currentIds);
  if (requestedIds.some((id) => !current.has(id))) return 'UNKNOWN';
  if (currentIds.some((id) => !requestedIds.includes(id))) return 'MISSING';
  return null;
}
