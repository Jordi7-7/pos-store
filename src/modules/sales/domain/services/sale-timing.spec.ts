import { resolveSaleTime } from './sale-timing';

const opened = new Date('2026-11-10T08:00:00Z');
const now = new Date('2026-11-10T20:00:00Z');

describe('resolveSaleTime', () => {
  it('sin hora indicada no fija ninguna', () => {
    expect(resolveSaleTime(undefined, opened, now)).toBeUndefined();
    expect(resolveSaleTime(new Date('no es una fecha'), opened, now)).toBeUndefined();
  });

  it('respeta la hora de una venta hecha durante el turno', () => {
    const during = new Date('2026-11-10T12:30:00Z');

    expect(resolveSaleTime(during, opened, now)).toBe(during);
  });

  it('una hora en el futuro (reloj adelantado) se acota a ahora', () => {
    expect(resolveSaleTime(new Date('2026-11-11T03:00:00Z'), opened, now)).toBe(now);
  });

  it('una hora anterior a la apertura del turno (reloj atrasado) se acota a la apertura', () => {
    expect(resolveSaleTime(new Date('2026-11-09T23:00:00Z'), opened, now)).toBe(opened);
  });
});
