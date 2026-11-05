import { AttemptPolicy } from '../services/login-attempts.service';

const WINDOW_SECONDS = 15 * 60;

export interface PasswordLoginThrottle {
  /** Mismo usuario desde la misma IP: frena a quien prueba contraseñas de una cuenta. */
  perAccountFromIp: AttemptPolicy;
  /** Mismo usuario desde cualquier IP: frena un ataque repartido entre muchas IP. */
  perAccount: AttemptPolicy;
}

/** Política de la IP sola: frena a quien prueba muchos usuarios o tiendas distintas desde un mismo origen. */
export function ipThrottle(clientIp: string): AttemptPolicy {
  return { key: `login_ip:${clientIp}`, maxAttempts: 100, windowSeconds: WINDOW_SECONDS };
}

/** Políticas por cuenta. El identificador se normaliza y codifica para que no pueda manipular la clave. */
export function accountThrottles(tenantId: string, identifier: string, clientIp: string): PasswordLoginThrottle {
  const account = encodeURIComponent(identifier.trim().toLowerCase()).slice(0, 120);
  return {
    perAccountFromIp: { key: `login_attempts:${tenantId}:${account}:${clientIp}`, maxAttempts: 5, windowSeconds: WINDOW_SECONDS },
    perAccount: { key: `login_attempts:${tenantId}:${account}`, maxAttempts: 20, windowSeconds: WINDOW_SECONDS },
  };
}
