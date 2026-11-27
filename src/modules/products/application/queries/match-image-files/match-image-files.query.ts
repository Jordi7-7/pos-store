export class MatchImageFilesQuery {
  constructor(
    public readonly tenantId: string,
    public readonly fileNames: string[],
  ) {}
}
