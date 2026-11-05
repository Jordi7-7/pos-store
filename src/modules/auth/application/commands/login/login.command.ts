export class LoginCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly tenantSlug: string | undefined,
    /** IP real del cliente (con TRUST_PROXY detrás del proxy); base del límite de intentos. */
    public readonly clientIp: string,
  ) {}
}
