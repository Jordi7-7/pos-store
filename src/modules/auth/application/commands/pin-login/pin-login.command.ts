export class PinLoginCommand {
  constructor(
    public readonly pin: string,
    public readonly tenantSlug: string,
    public readonly clientIp: string,
  ) {}
}
