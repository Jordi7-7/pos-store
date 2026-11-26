import { ValueTransformer } from 'typeorm';

/**
 * Las imágenes se guardan en la base solo con su clave dentro del bucket (`tenant-id/foto.jpg`); la dirección pública es esa clave
 * detrás de `AWS_S3_PUBLIC_URL` (el dominio del CDN).
 * La entidad de imagen y el panel piden la dirección aquí en vez de leer el entorno; `S3Service` todavía lee la variable
 * por su cuenta para armar la dirección al subir un archivo. Se lee en cada llamada, no al arrancar.
 */
export const publicBaseUrl = (): string => (process.env.AWS_S3_PUBLIC_URL ?? '').replace(/\/+$/, '');

/** De la clave guardada a la dirección pública. Una dirección ya completa, o sin dominio configurado, se deja como está. */
export function toPublicUrl(key: string): string {
  const base = publicBaseUrl();
  return !key || !base || /^https?:\/\//i.test(key) ? key : `${base}/${key}`;
}

/** De una dirección pública a la clave que se guarda (así leer y volver a guardar no acumula el dominio). */
export function toStorageKey(url: string): string {
  const base = publicBaseUrl();
  return base && url.startsWith(`${base}/`) ? url.slice(base.length + 1) : url;
}

/** Para una columna con la clave del archivo: la entidad ve la dirección pública y la base guarda solo la clave. */
export const publicUrlTransformer: ValueTransformer = {
  to: (value: string | null | undefined) => (typeof value === 'string' ? toStorageKey(value) : value),
  from: (value: string | null | undefined) => (typeof value === 'string' ? toPublicUrl(value) : value),
};
