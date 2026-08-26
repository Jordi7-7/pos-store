export class DeleteCustomerCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
  ) {}
}
