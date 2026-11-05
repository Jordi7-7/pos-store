import { Controller, Get, Post, Delete, Query, Body, Param, BadRequestException, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { S3Service } from '../../services/s3.service';
import { fetchRemoteImage } from '../../services/safe-image-fetcher';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { ProductImage } from '../../../products/domain/entities/product-image.entity';
import { RequirePermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly entityManager: EntityManager,
  ) {}

  @Get('presigned-url')
  @RequirePermissions(APP_PERMISSIONS.MEDIA_UPLOAD)
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
  @RequirePermissions(APP_PERMISSIONS.MEDIA_GET)
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
  @RequirePermissions(APP_PERMISSIONS.MEDIA_UPLOAD)
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
    // Solo se pueden registrar objetos del propio tenant (evita apuntar a archivos ajenos)
    this.s3Service.assertBelongsToTenant(tenantId, url);
    image.url = this.s3Service.cleanUrl(url);
    image.description = description;

    return imageRepo.save(image);
  }

  @Delete(':id')
  @RequirePermissions(APP_PERMISSIONS.MEDIA_DELETE)
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

    // Delete physically from S3/R2 bucket (solo si el objeto es del tenant; si no, se borra solo el registro)
    if (this.s3Service.belongsToTenant(tenantId, image.url)) {
      await this.s3Service.deleteFile(image.url);
    } else {
      this.logger.warn(`Image ${image.id} points outside Tenant ${tenantId} storage; skipping S3 deletion.`);
    }

    // Delete from database
    await imageRepo.remove(image);

    return { success: true, message: 'Imagen eliminada exitosamente' };
  }

  @Post('upload-by-url')
  @RequirePermissions(APP_PERMISSIONS.MEDIA_UPLOAD)
  async uploadByUrl(
    @CurrentUser('tenantId') tenantId: string,
    @Body('url') url: string,
    @Body('description') description?: string,
  ) {
    if (!url) {
      throw new BadRequestException('url is required');
    }

    this.logger.log(`Fetching remote image for Tenant ${tenantId}`);

    // Descarga segura: bloquea IPs privadas/metadatos, redirecciones, tipos no imagen y tamaños excesivos.
    const { buffer, contentType } = await fetchRemoteImage(url);

    // Extract filename from URL or generate one
    let filename = 'downloaded-image.jpg';
    try {
      const pathname = new URL(url).pathname;
      const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1);
      if (lastSegment && lastSegment.includes('.')) {
        filename = lastSegment;
      }
    } catch {
      // se conserva el nombre por defecto
    }

    // Upload buffer to S3/R2
    const fileUrl = await this.s3Service.uploadFileBuffer(tenantId, filename, contentType, buffer);

    // Register image in database
    const imageRepo = this.entityManager.getRepository(ProductImage);
    const image = new ProductImage();
    image.tenantId = tenantId;
    image.url = this.s3Service.cleanUrl(fileUrl);
    image.description = description || 'Imagen arrastrada de internet';

    return imageRepo.save(image);
  }
}

