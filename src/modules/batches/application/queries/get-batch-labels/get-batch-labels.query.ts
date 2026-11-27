export class GetBatchLabelsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly batchId: string,
    public readonly userId: string,
    public readonly isOwner: boolean,
  ) {}
}
