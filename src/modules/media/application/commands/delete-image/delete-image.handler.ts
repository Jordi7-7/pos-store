import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DeleteImageCommand } from './delete-image.command';
import { ProductImage } from '../../../../products/domain/entities/product-image.entity';
import { S3Service } from '../../../services/s3.service';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

export interface DeleteImageResult {
  success: true;
  message: string;
}

@CommandHandler(DeleteImageCommand)
export class DeleteImageHandler implements ICommandHandler<DeleteImageCommand> {
  private readonly logger = new Logger(DeleteImageHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly s3Service: S3Service,
  ) {}

  async execute(command: DeleteImageCommand): Promise<DeleteImageResult> {
    const { tenantId, id } = command;
    this.logger.log(`Deleting image ID: ${id} for Tenant: ${tenantId}`);

    const imageRepo = this.entityManager.getRepository(ProductImage);

    const image = await imageRepo.findOne({ where: { id, tenantId } });
    if (!image) {
      this.logger.warn(`Image deletion failed: ID ${id} not found for Tenant ${tenantId}`);
      throw new AppException(ErrorCode.MediaNotFound, 'Imagen no encontrada.', HttpStatus.NOT_FOUND);
    }

    const isUsed = await this.isAssignedToProductOrVariant(id);
    if (isUsed) {
      this.logger.warn(`Image deletion rejected: ID ${id} is assigned to products`);
      throw new AppException(
        ErrorCode.MediaInUse,
        'No se puede eliminar la imagen porque está asignada a uno o más productos.',
        HttpStatus.CONFLICT,
      );
    }

    // Borra el archivo solo si es del tenant; si no, se elimina únicamente el registro
    if (this.s3Service.belongsToTenant(tenantId, image.url)) {
      await this.s3Service.deleteFile(image.url);
    } else {
      this.logger.warn(`Image ${image.id} points outside Tenant ${tenantId} storage; skipping S3 deletion.`);
    }

    await imageRepo.remove(image);
    return { success: true, message: 'Imagen eliminada exitosamente' };
  }

  private async isAssignedToProductOrVariant(imageId: string): Promise<boolean> {
    for (const [table, alias] of [
      ['product_image_mappings', 'pim'],
      ['product_variant_image_mappings', 'pvim'],
    ] as const) {
      const row: unknown = await this.entityManager
        .createQueryBuilder()
        .select('1')
        .from(table, alias)
        .where(`${alias}.product_image_id = :imageId`, { imageId })
        .limit(1)
        .getRawOne();
      if (row) {
        return true;
      }
    }
    return false;
  }
}
