export class CreateAttributeCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
  ) {}
}
