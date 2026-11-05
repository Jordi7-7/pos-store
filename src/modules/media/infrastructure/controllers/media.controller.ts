import { Controller, Get, Post, Delete, Query, Body, Param } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';
import { ProductImage } from '../../../products/domain/entities/product-image.entity';
import { ListImagesQueryDto, PresignedUrlQueryDto, RegisterImageDto, UploadImageByUrlDto } from '../dtos/media.dto';
import { GetPresignedUploadUrlQuery } from '../../application/queries/get-presigned-upload-url/get-presigned-upload-url.query';
import { ListImagesQuery } from '../../application/queries/list-images/list-images.query';
import { ImagesPage } from '../../application/queries/list-images/list-images.handler';
import { RegisterImageCommand } from '../../application/commands/register-image/register-image.command';
import { DeleteImageCommand } from '../../application/commands/delete-image/delete-image.command';
import { DeleteImageResult } from '../../application/commands/delete-image/delete-image.handler';
import { UploadImageByUrlCommand } from '../../application/commands/upload-image-by-url/upload-image-by-url.command';
import { S3Service } from '../../services/s3.service';

@Controller('media')
export class MediaController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('presigned-url')
  @RequirePermissions(APP_PERMISSIONS.MEDIA_UPLOAD)
  async getPresignedUrl(@CurrentUser('tenantId') tenantId: string, @Query() query: PresignedUrlQueryDto) {
    return this.queryBus.execute<GetPresignedUploadUrlQuery, Awaited<ReturnType<S3Service['getUploadPresignedUrl']>>>(
      new GetPresignedUploadUrlQuery(tenantId, query.filename, query.contentType),
    );
  }

  @Get()
  @RequirePermissions(APP_PERMISSIONS.MEDIA_GET)
  async getImages(@CurrentUser('tenantId') tenantId: string, @Query() query: ListImagesQueryDto) {
    return this.queryBus.execute<ListImagesQuery, ImagesPage>(
      new ListImagesQuery(tenantId, query.page, query.limit, query.search),
    );
  }

  @Post('register')
  @RequirePermissions(APP_PERMISSIONS.MEDIA_UPLOAD)
  async registerImage(@CurrentUser('tenantId') tenantId: string, @Body() dto: RegisterImageDto) {
    return this.commandBus.execute<RegisterImageCommand, ProductImage>(
      new RegisterImageCommand(tenantId, dto.url, dto.description),
    );
  }

  @Delete(':id')
  @RequirePermissions(APP_PERMISSIONS.MEDIA_DELETE)
  async deleteImage(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.commandBus.execute<DeleteImageCommand, DeleteImageResult>(new DeleteImageCommand(tenantId, id));
  }

  @Post('upload-by-url')
  @RequirePermissions(APP_PERMISSIONS.MEDIA_UPLOAD)
  async uploadByUrl(@CurrentUser('tenantId') tenantId: string, @Body() dto: UploadImageByUrlDto) {
    return this.commandBus.execute<UploadImageByUrlCommand, ProductImage>(
      new UploadImageByUrlCommand(tenantId, dto.url, dto.description),
    );
  }
}
