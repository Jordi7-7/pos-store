import { DateTime, IANAZone } from 'luxon';

export const DEFAULT_TIMEZONE = 'America/Guayaquil';

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DashboardPeriods {
  today: DateRange;
  yesterday: DateRange;
  /** Semana en curso, de lunes a domingo. */
  week: DateRange;
  previousWeek: DateRange;
  /** Ventana para los productos más vendidos. */
  topProductsSince: Date;
  /** Ventana de actividad para considerar un producto en el aviso de poco stock. */
  lowStockActivitySince: Date;
}

/** Zona horaria usable: la del tenant si es una zona IANA válida, si no la de respaldo. */
export function resolveTimezone(candidate: string | null | undefined): string {
  return candidate && IANAZone.isValidZone(candidate) ? candidate : DEFAULT_TIMEZONE;
}

function dayRange(moment: DateTime): DateRange {
  return { from: moment.startOf('day').toJSDate(), to: moment.endOf('day').toJSDate() };
}

function weekRange(moment: DateTime): DateRange {
  return { from: moment.startOf('week').toJSDate(), to: moment.endOf('week').toJSDate() };
}

/** Rangos de fechas del panel, calculados en la zona horaria del momento recibido. */
export function dashboardPeriods(now: DateTime): DashboardPeriods {
  return {
    today: dayRange(now),
    yesterday: dayRange(now.minus({ days: 1 })),
    week: weekRange(now),
    previousWeek: weekRange(now.minus({ weeks: 1 })),
    topProductsSince: now.minus({ days: 30 }).startOf('day').toJSDate(),
    lowStockActivitySince: now.minus({ months: 6 }).startOf('day').toJSDate(),
  };
}
