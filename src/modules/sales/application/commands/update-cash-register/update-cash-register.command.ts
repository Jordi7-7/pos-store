export class UpdateCashRegisterCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly name?: string,
    public readonly isActive?: boolean,
  ) {}
}
