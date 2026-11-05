import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';

/**
 * Entorno de los tests HTTP. Debe importarse ANTES que `AppModule`: la aplicación lee la
 * configuración de la base de datos y los secretos al cargarse, y esta base de datos de prueba
 * (con nombre único) se crea después con ese mismo nombre.
 */
dotenv.config();

export const run = randomBytes(4).toString('hex');
export const httpDatabaseName = `pos_store_it_http_${process.pid}_${run}`;
export const onboardingKey = `onboarding-${run}-clave-de-prueba`;

Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_DATABASE: httpDatabaseName,
  JWT_SECRET: `jwt-secret-${run}-0123456789`,
  REFRESH_TOKEN_SECRET: `refresh-secret-${run}-0123456789`,
  ONBOARDING_API_KEY: onboardingKey,
  TRUST_PROXY: '1',
});
