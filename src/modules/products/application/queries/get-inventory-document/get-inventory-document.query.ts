export class GetInventoryDocumentQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string | undefined,
    public readonly isOwner: boolean | undefined,
    public readonly documentId: string,
  ) {}
}
