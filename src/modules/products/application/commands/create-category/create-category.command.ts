export class CreateCategoryCommand {
  constructor(
    public readonly tenantId: string,
    public readonly name: string,
  ) {}
}
