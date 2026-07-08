export class CreateSupplierCommand {
  constructor(
    public readonly tenantId: string,
    public readonly identityNumber: string,
    public readonly name: string,
    public readonly email?: string,
    public readonly phone?: string,
    public readonly address?: string,
  ) {}
}
