export class DeleteAttributeValueCommand {
  constructor(
    public readonly tenantId: string,
    public readonly valueId: string,
  ) {}
}
