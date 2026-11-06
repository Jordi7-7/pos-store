import type { CookieOptions } from 'express';

/**
 * Cookie del refresh token para la web. Es `HttpOnly` (el JavaScript de la página no puede leerla, así que un
 * XSS no se lleva la sesión) y `SameSite=Strict` (el navegador no la manda desde otro sitio, que es la defensa
 * principal contra CSRF; la cabecera propia de `WebRequestGuard` es la segunda).
 */
export interface RefreshCookieConfig {
  name: string;
  /** Ruta que ve el navegador. Detrás de Caddy la API cuelga de `/api`, así que en producción es `/api/auth/web`. */
  path: string;
  secure: boolean;
}

export const DEFAULT_COOKIE_NAME = 'pos_rt';
export const DEFAULT_COOKIE_PATH = '/auth/web';

type Env = Record<string, string | undefined>;

export function refreshCookieConfig(env: Env = process.env): RefreshCookieConfig {
  const explicitSecure = env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  return {
    name: env.AUTH_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME,
    path: env.AUTH_COOKIE_PATH?.trim() || DEFAULT_COOKIE_PATH,
    // Con HTTPS en el borde debe ser `true`; solo se relaja fuera de producción (desarrollo en http://localhost)
    secure: explicitSecure ? explicitSecure === 'true' : env.NODE_ENV === 'production',
  };
}

/** Opciones de la cookie con el refresh token; `maxAgeSeconds` iguala su vida a la del token. */
export function refreshCookieOptions(config: RefreshCookieConfig, maxAgeSeconds: number): CookieOptions {
  return { httpOnly: true, secure: config.secure, sameSite: 'strict', path: config.path, maxAge: maxAgeSeconds * 1000 };
}

/** Para borrar la cookie hay que repetir ruta y atributos con los que se creó. */
export function clearCookieOptions(config: RefreshCookieConfig): CookieOptions {
  return { httpOnly: true, secure: config.secure, sameSite: 'strict', path: config.path };
}

/** Valor de una cookie en la cabecera `Cookie`, o `undefined`. No hace falta `cookie-parser` para leer una sola. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
