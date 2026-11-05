export class RegisterImageCommand {
  constructor(
    public readonly tenantId: string,
    public readonly url: string,
    public readonly description?: string,
  ) {}
}
