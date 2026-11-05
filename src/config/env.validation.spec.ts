import { parseCorsOrigins, validateEnv } from './env.validation';

const validEnv = {
  JWT_SECRET: 'a-very-long-random-secret-1',
  REFRESH_TOKEN_SECRET: 'another-very-long-secret-2',
  DB_PASSWORD: 's3cure-db-password',
};

describe('validateEnv', () => {
  it('acepta una configuración válida', () => {
    expect(validateEnv(validEnv)).toBe(validEnv);
  });

  it('falla si falta un secreto', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: undefined })).toThrow(/JWT_SECRET es obligatoria/);
  });

  it('rechaza secretos cortos', () => {
    expect(() => validateEnv({ ...validEnv, REFRESH_TOKEN_SECRET: 'short' })).toThrow(/al menos 16/);
  });

  it("rechaza el valor inseguro conocido 'fallback_secret'", () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: 'fallback_secret' })).toThrow(/inseguro/);
  });

  it('rechaza los marcadores de la plantilla .env.example sin rellenar, aunque tengan longitud suficiente', () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: '<secreto-aleatorio-1>' })).toThrow(/marcador de la plantilla/);
    expect(() => validateEnv({ ...validEnv, REFRESH_TOKEN_SECRET: '<secreto-aleatorio-2-distinto-del-anterior>' })).toThrow(/marcador de la plantilla/);
    expect(() => validateEnv({ ...validEnv, DB_PASSWORD: '<contraseña-de-postgres>' })).toThrow(/marcador de la plantilla/);
  });

  it('exige DB_PASSWORD y prohíbe contraseñas por defecto en producción', () => {
    expect(() => validateEnv({ ...validEnv, DB_PASSWORD: '' })).toThrow(/DB_PASSWORD es obligatoria/);
    expect(() => validateEnv({ ...validEnv, DB_PASSWORD: 'postgres', NODE_ENV: 'production', CORS_ORIGINS: 'https://a.com' })).toThrow(
      /producción/,
    );
  });

  it('en producción exige CORS_ORIGINS', () => {
    expect(() => validateEnv({ ...validEnv, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS/);
  });
});

describe('parseCorsOrigins', () => {
  it('devuelve true (sin restricción) si no hay configuración', () => {
    expect(parseCorsOrigins(undefined)).toBe(true);
    expect(parseCorsOrigins('  ')).toBe(true);
  });

  it('separa y limpia la lista de orígenes', () => {
    expect(parseCorsOrigins('https://a.com, https://b.com ,')).toEqual(['https://a.com', 'https://b.com']);
  });
});
