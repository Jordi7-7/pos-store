export class GeneratePinCommand {
  constructor(
    public readonly tenantId: string,
    public readonly targetUserId: string,
  ) {}
}
