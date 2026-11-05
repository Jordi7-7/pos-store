import * as path from 'path';

/**
 * Conexión compartida por la app y por el CLI de migraciones: una sola fuente de entidades,
 * para que ninguna quede registrada solo en uno de los dos sitios.
 * Es una función porque debe leer `process.env` después de cargar el `.env`.
 */
export function databaseConnectionOptions() {
  return {
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'pos_store',
    synchronize: false,
    entities: [path.join(__dirname, '../**/*.entity.{ts,js}')],
  };
}
