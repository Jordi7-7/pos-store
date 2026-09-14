export class AssignUsersToCashRegisterCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
    public readonly userIds: string[],
  ) {}
}
