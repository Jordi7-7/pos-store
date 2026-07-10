import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ProductImage } from '../products/domain/entities/product-image.entity';
import { S3Service } from './services/s3.service';
import { MediaController } from './infrastructure/controllers/media.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductImage]),
    ConfigModule,
  ],
  controllers: [MediaController],
  providers: [S3Service],
  exports: [S3Service],
})
export class MediaModule {}
