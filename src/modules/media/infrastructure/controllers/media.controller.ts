import { Controller, Get, Post, Delete, Query, Body, Param, BadRequestException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { S3Service } from '../../services/s3.service';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { ProductImage } from '../../../products/domain/entities/product-image.entity';

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

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

  @Get()
  async getImages(
    @CurrentUser('tenantId') tenantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    const isPaginated = page !== undefined || limit !== undefined;
    const p = page ? Math.max(1, Number(page)) : 1;
    const l = limit ? Math.max(1, Number(limit)) : 20;

    const imageRepo = this.entityManager.getRepository(ProductImage);
    const qb = imageRepo.createQueryBuilder('image')
      .where('image.tenantId = :tenantId', { tenantId });

    if (search && search.trim() !== '') {
      qb.andWhere('image.description ILIKE :search', { search: `%${search.trim()}%` });
    }

    qb.orderBy('image.createdAt', 'DESC');

    if (isPaginated) {
      const skip = (p - 1) * l;
      qb.skip(skip).take(l);
      const [images, total] = await qb.getManyAndCount();

      return {
        data: images,
        meta: {
          total,
          page: p,
          limit: l,
          totalPages: Math.ceil(total / l) || 1,
        },
      };
    }

    // Default when no pagination params are sent: return all images (up to 1000)
    qb.take(1000);
    const [images, total] = await qb.getManyAndCount();

    return {
      data: images,
      meta: {
        total,
        page: 1,
        limit: total,
        totalPages: 1,
      },
    };
  }

  @Post('register')
  async registerImage(
    @CurrentUser('tenantId') tenantId: string,
    @Body('url') url: string,
    @Body('description') description?: string,
  ) {
    if (!url) {
      throw new BadRequestException('url is required');
    }

    const imageRepo = this.entityManager.getRepository(ProductImage);
    const image = new ProductImage();
    image.tenantId = tenantId;
    image.url = this.s3Service.cleanUrl(url);
    image.description = description;

    return imageRepo.save(image);
  }

  @Delete(':id')
  async deleteImage(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const imageRepo = this.entityManager.getRepository(ProductImage);
    
    // Find image and verify tenant
    const image = await imageRepo.findOne({
      where: { id, tenantId }
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    // Check association with products (ManyToMany via product_image_mappings)
    const isAssociatedToProduct = await this.entityManager
      .createQueryBuilder()
      .select('1')
      .from('product_image_mappings', 'pim')
      .where('pim.product_image_id = :id', { id })
      .limit(1)
      .getRawOne();

    // Check association with product variants (ManyToMany via product_variant_image_mappings)
    const isAssociatedToVariant = await this.entityManager
      .createQueryBuilder()
      .select('1')
      .from('product_variant_image_mappings', 'pvim')
      .where('pvim.product_image_id = :id', { id })
      .limit(1)
      .getRawOne();

    if (isAssociatedToProduct || isAssociatedToVariant) {
      throw new ConflictException('No se puede eliminar la imagen porque está asignada a uno o más productos.');
    }

    // Delete physically from S3/R2 bucket
    await this.s3Service.deleteFile(image.url);

    // Delete from database
    await imageRepo.remove(image);

    return { success: true, message: 'Imagen eliminada exitosamente' };
  }

  @Post('upload-by-url')
  async uploadByUrl(
    @CurrentUser('tenantId') tenantId: string,
    @Body('url') url: string,
    @Body('description') description?: string,
  ) {
    if (!url) {
      throw new BadRequestException('url is required');
    }

    try {
      this.logger.log(`Fetching remote image for Tenant ${tenantId} from URL: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract filename from URL or generate one
      let filename = 'downloaded-image.jpg';
      try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname;
        const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
        if (lastSegment && lastSegment.includes('.')) {
          filename = lastSegment;
        }
      } catch (e) {}

      // Upload buffer to S3/R2
      const fileUrl = await this.s3Service.uploadFileBuffer(tenantId, filename, contentType, buffer);

      // Register image in database
      const imageRepo = this.entityManager.getRepository(ProductImage);
      const image = new ProductImage();
      image.tenantId = tenantId;
      image.url = this.s3Service.cleanUrl(fileUrl);
      image.description = description || 'Imagen arrastrada de internet';

      return imageRepo.save(image);
    } catch (error: any) {
      throw new BadRequestException(`No se pudo procesar la imagen de la URL: ${error.message}`);
    }
  }
}

