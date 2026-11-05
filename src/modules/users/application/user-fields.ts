import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';

/** Nombre de usuario canónico: minúsculas y sin espacios en los extremos. Un valor vacío es inválido. */
export function normalizeUsername(raw: string): string {
  const username = raw.toLowerCase().trim();
  if (!username) {
    throw new AppException(ErrorCode.UsernameRequired, 'El nombre de usuario no puede estar vacío.', HttpStatus.BAD_REQUEST);
  }
  return username;
}

/** Correo canónico, o null si no se informó (el correo es opcional). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim();
  return email ? email.toLowerCase() : null;
}
