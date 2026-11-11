/**
 * Hora en que se hizo una venta. Una venta hecha sin conexión llega al servidor más tarde y trae la hora real
 * en que se cobró, para que el cierre de caja y los reportes la cuenten en su día. El reloj del aparato puede
 * estar mal, así que la hora se acota a lo que es posible: la venta ocurrió con el turno abierto (no antes de
 * que se abriera) y no puede estar en el futuro. Sin hora indicada, no se fija ninguna (rige la de registro).
 */
export function resolveSaleTime(occurredAt: Date | undefined, sessionOpenedAt: Date, now: Date): Date | undefined {
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) return undefined;
  if (occurredAt.getTime() > now.getTime()) return now;
  if (occurredAt.getTime() < sessionOpenedAt.getTime()) return sessionOpenedAt;
  return occurredAt;
}
