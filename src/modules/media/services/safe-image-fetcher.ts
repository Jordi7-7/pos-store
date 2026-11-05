import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

export const ALLOWED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export interface RemoteImage {
  buffer: Buffer;
  contentType: string;
}

export interface FetchImageOptions {
  maxBytes?: number;
  timeoutMs?: number;
  /** Decide si una IP resuelta es un destino permitido. Por defecto solo IPs públicas. */
  isAddressAllowed?: (address: string) => boolean;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

function invalidUrl(message: string): AppException {
  return new AppException(ErrorCode.InvalidMediaUrl, message, HttpStatus.BAD_REQUEST);
}

function ipv4ToInt(address: string): number {
  return address.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "esta red"
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incluye metadatos cloud 169.254.169.254)
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // reservada IETF
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservada / broadcast
];

/** true si la IP NO es un destino público (privada, loopback, link-local, metadatos, etc.). */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const value = ipv4ToInt(address);
    return BLOCKED_IPV4_RANGES.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) >>> 0 === (ipv4ToInt(base) & mask) >>> 0;
    });
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') || // fc00::/7 (ULA)
      /^fe[89ab]/.test(normalized) || // fe80::/10 (link-local)
      normalized.startsWith('ff') // multicast
    );
  }
  return true; // si no es una IP válida, no se permite
}

/**
 * Descarga una imagen remota de forma segura (anti-SSRF):
 * - solo http/https, sin credenciales en la URL;
 * - la IP se valida en el momento de conectar (cierra el DNS rebinding);
 * - no sigue redirecciones; con timeout y límite de tamaño;
 * - solo acepta tipos de imagen conocidos.
 */
export async function fetchRemoteImage(rawUrl: string, options: FetchImageOptions = {}): Promise<RemoteImage> {
  const { maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const isAddressAllowed = options.isAddressAllowed ?? ((address: string) => !isBlockedAddress(address));

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw invalidUrl('La URL de la imagen no es válida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalidUrl('Solo se permiten URLs http o https.');
  }
  if (url.username || url.password) {
    throw invalidUrl('La URL no puede incluir credenciales.');
  }

  // Si el host ya es una IP literal, Node NO consulta el DNS (el `lookup` de abajo no se ejecuta),
  // así que hay que validarla aquí. Si es un nombre, se valida la IP resuelta en `lookup`.
  const literalHost = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(literalHost) !== 0 && !isAddressAllowed(literalHost)) {
    throw invalidUrl('Destino no permitido.');
  }

  const client = url.protocol === 'https:' ? https : http;

  return new Promise<RemoteImage>((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: { accept: ALLOWED_IMAGE_TYPES.join(', ') },
        lookup: (hostname, lookupOptions, callback) => {
          dns.lookup(hostname, lookupOptions, (err, address, family) => {
            const addresses = Array.isArray(address) ? address.map((a) => a.address) : [address];
            if (!err && addresses.some((a) => !isAddressAllowed(a))) {
              callback(new Error('Destino no permitido.') as NodeJS.ErrnoException, '', 4);
              return;
            }
            callback(err, address as string, family as number);
          });
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          reject(invalidUrl('No se permiten redirecciones.'));
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(invalidUrl(`El servidor remoto respondió con estado ${status}.`));
          return;
        }

        const contentType = (response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
          response.resume();
          reject(
            new AppException(
              ErrorCode.UnsupportedMediaType,
              'El archivo remoto no es una imagen compatible.',
              HttpStatus.UNSUPPORTED_MEDIA_TYPE,
            ),
          );
          return;
        }

        const declaredLength = Number(response.headers['content-length']);
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          response.resume();
          reject(tooLarge(maxBytes));
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            request.destroy();
            reject(tooLarge(maxBytes));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType }));
        response.on('error', () => reject(invalidUrl('No se pudo descargar la imagen.')));
      },
    );

    request.on('timeout', () => {
      request.destroy();
      reject(invalidUrl('Tiempo de espera agotado al descargar la imagen.'));
    });
    request.on('error', (error) => {
      reject(error instanceof AppException ? error : invalidUrl('No se pudo descargar la imagen (destino no permitido o inaccesible).'));
    });
    request.end();
  });
}

function tooLarge(maxBytes: number): AppException {
  return new AppException(
    ErrorCode.PayloadTooLarge,
    `La imagen supera el tamaño máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    HttpStatus.PAYLOAD_TOO_LARGE,
  );
}
