export interface ValidatedEnv {
  JWT_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  DB_PASSWORD: string;
}

const MIN_SECRET_LENGTH = 16;
const INSECURE_VALUES: ReadonlySet<string> = new Set(['fallback_secret', 'postgres', 'changeme', 'secret']);

function requireString(env: Record<string, unknown>, key: string, errors: string[]): string {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${key} es obligatoria.`);
    return '';
  }
  return value;
}

/**
 * Valida las variables de entorno críticas al arrancar. Si falta alguna o tiene un
 * valor inseguro conocido, la aplicación NO arranca (fail fast) en lugar de caer en
 * secretos por defecto.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  for (const key of ['JWT_SECRET', 'REFRESH_TOKEN_SECRET'] as const) {
    const value = requireString(env, key, errors);
    if (value && value.length < MIN_SECRET_LENGTH) {
      errors.push(`${key} debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`);
    }
    if (value && INSECURE_VALUES.has(value)) {
      errors.push(`${key} usa un valor inseguro conocido.`);
    }
  }

  const dbPassword = requireString(env, 'DB_PASSWORD', errors);
  if (dbPassword && env.NODE_ENV === 'production' && INSECURE_VALUES.has(dbPassword)) {
    errors.push('DB_PASSWORD usa un valor inseguro conocido en producción.');
  }

  if (env.NODE_ENV === 'production') {
    requireString(env, 'CORS_ORIGINS', errors);
  }

  if (errors.length > 0) {
    throw new Error(`Configuración de entorno inválida:\n- ${errors.join('\n- ')}`);
  }
  return env;
}

/** Lista de orígenes CORS permitidos a partir de `CORS_ORIGINS` (separados por coma). */
export function parseCorsOrigins(raw: string | undefined): string[] | true {
  if (!raw || raw.trim() === '') {
    return true; // solo se llega aquí fuera de producción (validateEnv lo exige en producción)
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
