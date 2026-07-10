import { Controller, Get, Post, Query, Body, BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { S3Service } from '../../services/s3.service';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { ProductImage } from '../../../products/domain/entities/product-image.entity';

@Controller('media')
export class MediaController {
  constructor(
    private readonly s3Service: S3Service,
    private readonly entityManager: EntityManager,
  ) {}

  @Get('presigned-url')
  async getPresignedUrl(
    @CurrentUser('tenantId') tenantId: string,
    @Query('filename') filename: string,
    @Query('contentType') contentType: string,
  ) {
    if (!filename || !contentType) {
      throw new BadRequestException('filename and contentType query parameters are required');
    }
    return this.s3Service.getUploadPresignedUrl(tenantId, filename, contentType);
  }

  @Post('register')
  async registerImage(
    @CurrentUser('tenantId') tenantId: string,
    @Body('url') url: string,
  ) {
    if (!url) {
      throw new BadRequestException('url is required');
    }

    const imageRepo = this.entityManager.getRepository(ProductImage);
    const image = new ProductImage();
    image.tenantId = tenantId;
    image.url = url;

    return imageRepo.save(image);
  }
}
