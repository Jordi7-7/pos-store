export class CreateTagCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
  ) {}
}
