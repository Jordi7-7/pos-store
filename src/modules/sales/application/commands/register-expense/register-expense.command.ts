export class RegisterExpenseCommand {
  constructor(
    public readonly tenantId: string,
    public readonly branchId: string,
    public readonly description: string,
    public readonly amount: number,
    public readonly category: string,
  ) {}
}
