import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetPresignedUploadUrlQuery } from './get-presigned-upload-url.query';
import { S3Service } from '../../../services/s3.service';

@QueryHandler(GetPresignedUploadUrlQuery)
export class GetPresignedUploadUrlHandler implements IQueryHandler<GetPresignedUploadUrlQuery> {
  constructor(private readonly s3Service: S3Service) {}

  execute(query: GetPresignedUploadUrlQuery): ReturnType<S3Service['getUploadPresignedUrl']> {
    return this.s3Service.getUploadPresignedUrl(query.tenantId, query.filename, query.contentType);
  }
}
