import { DateTime } from 'luxon';
import { DEFAULT_TIMEZONE, dashboardPeriods, resolveTimezone } from './dashboard-periods';

describe('resolveTimezone', () => {
  it('acepta zonas IANA válidas', () => {
    expect(resolveTimezone('America/Lima')).toBe('America/Lima');
  });

  it('cae en la zona por defecto con valores vacíos o inexistentes', () => {
    expect([resolveTimezone(undefined), resolveTimezone(''), resolveTimezone('Marte/Olimpo')]).toEqual([
      DEFAULT_TIMEZONE,
      DEFAULT_TIMEZONE,
      DEFAULT_TIMEZONE,
    ]);
  });

  it('rechaza un texto con comillas, que nunca debe llegar a una consulta SQL', () => {
    expect(resolveTimezone("UTC' OR '1'='1")).toBe(DEFAULT_TIMEZONE);
  });
});

describe('dashboardPeriods', () => {
  // Miércoles 2026-11-04, 15:00 en Guayaquil (UTC-5)
  const now = DateTime.fromISO('2026-11-04T15:00:00', { zone: 'America/Guayaquil' });
  const periods = dashboardPeriods(now);
  const local = (date: Date) => DateTime.fromJSDate(date).setZone('America/Guayaquil').toFormat("yyyy-MM-dd'T'HH:mm");

  it('hoy y ayer cubren el día completo en la zona del tenant', () => {
    expect([local(periods.today.from), local(periods.today.to)]).toEqual(['2026-11-04T00:00', '2026-11-04T23:59']);
    expect([local(periods.yesterday.from), local(periods.yesterday.to)]).toEqual(['2026-11-03T00:00', '2026-11-03T23:59']);
  });

  it('la semana empieza el lunes y la anterior la precede', () => {
    expect([local(periods.week.from), local(periods.week.to)]).toEqual(['2026-11-02T00:00', '2026-11-08T23:59']);
    expect([local(periods.previousWeek.from), local(periods.previousWeek.to)]).toEqual(['2026-10-26T00:00', '2026-11-01T23:59']);
  });

  it('las ventanas de 30 días y 6 meses empiezan a medianoche', () => {
    expect(local(periods.topProductsSince)).toBe('2026-10-05T00:00');
    expect(local(periods.lowStockActivitySince)).toBe('2026-05-04T00:00');
  });
});
