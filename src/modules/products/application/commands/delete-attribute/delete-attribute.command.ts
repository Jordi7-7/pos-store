export class DeleteAttributeCommand {
  constructor(
    public readonly tenantId: string,
    public readonly attributeId: string,
  ) {}
}
