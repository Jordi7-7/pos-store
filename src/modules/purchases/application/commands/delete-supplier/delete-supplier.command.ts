export class DeleteSupplierCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
  ) {}
}
