export class CloseCashSessionCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly closingBalance: number,
  ) {}
}
