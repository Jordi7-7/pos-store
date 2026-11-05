const UNIQUE_VIOLATION = '23505';

interface PostgresErrorShape {
  code?: string;
  constraint?: string;
}

/**
 * Indica si un error de Postgres es una violación de unicidad, opcionalmente de un índice o
 * restricción concreto. Sirve para traducir carreras (dos peticiones que pasan la comprobación
 * a la vez) a un error de negocio en lugar de dejar escapar el error crudo de la base de datos.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint: violated } = error as PostgresErrorShape;
  return code === UNIQUE_VIOLATION && (constraint === undefined || violated === constraint);
}
