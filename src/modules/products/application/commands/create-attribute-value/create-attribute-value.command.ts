export class CreateAttributeValueCommand {
  constructor(
    public readonly tenantId: string,
    public readonly attributeId: string,
    public readonly value: string,
  ) {}
}
