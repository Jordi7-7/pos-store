export class GetPresignedUploadUrlQuery {
  constructor(
    public readonly tenantId: string,
    public readonly filename: string,
    public readonly contentType: string,
  ) {}
}
