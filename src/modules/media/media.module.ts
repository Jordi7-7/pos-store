import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ProductImage } from '../products/domain/entities/product-image.entity';
import { S3Service } from './services/s3.service';
import { MediaController } from './infrastructure/controllers/media.controller';
import { GetPresignedUploadUrlHandler } from './application/queries/get-presigned-upload-url/get-presigned-upload-url.handler';
import { ListImagesHandler } from './application/queries/list-images/list-images.handler';
import { RegisterImageHandler } from './application/commands/register-image/register-image.handler';
import { DeleteImageHandler } from './application/commands/delete-image/delete-image.handler';
import { UploadImageByUrlHandler } from './application/commands/upload-image-by-url/upload-image-by-url.handler';

@Module({
  imports: [TypeOrmModule.forFeature([ProductImage]), ConfigModule, CqrsModule],
  controllers: [MediaController],
  providers: [
    S3Service,
    GetPresignedUploadUrlHandler,
    ListImagesHandler,
    RegisterImageHandler,
    DeleteImageHandler,
    UploadImageByUrlHandler,
  ],
  exports: [S3Service],
})
export class MediaModule {}
