export class CreateCashRegisterCommand {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string,
    public readonly name: string,
  ) {}
}
