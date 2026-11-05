export class DeleteImageCommand {
  constructor(
    public readonly tenantId: string,
    public readonly id: string,
  ) {}
}
