import { IANAZone } from 'luxon';

export const DEFAULT_TIMEZONE = 'America/Guayaquil';

/** Zona horaria usable: la del tenant si es una zona IANA válida, si no la de respaldo. */
export function resolveTimezone(candidate: string | null | undefined): string {
  return candidate && IANAZone.isValidZone(candidate) ? candidate : DEFAULT_TIMEZONE;
}
