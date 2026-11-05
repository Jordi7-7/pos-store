import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager, In, Not } from 'typeorm';
import { UpdateVariantCommand } from './update-variant.command';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { translatingSkuConflict } from '../../services/sku-conflict';
import { Product } from '../../../domain/entities/product.entity';
import { ProductType } from '../../../domain/enums/product-type.enum';
import { assertSkusDoNotShadowBaseSku } from '../../services/base-sku';
import { normalizeSku } from '../../../domain/sku';

@CommandHandler(UpdateVariantCommand)
export class UpdateVariantHandler implements ICommandHandler<UpdateVariantCommand> {
  private readonly logger = new Logger(UpdateVariantHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  execute(command: UpdateVariantCommand): Promise<ProductVariant> {
    return translatingSkuConflict(() => this.entityManager.transaction((manager) => this.run(manager, command)));
  }

  private async run(manager: EntityManager, command: UpdateVariantCommand): Promise<ProductVariant> {
    const {
      tenantId,
      variantId,
      barcode,
      purchasePrice,
      salePrice,
      wholesalePrice,
      imageIds,
    } = command;
    const sku = command.sku === undefined ? undefined : normalizeSku(command.sku);

    this.logger.log(`Updating variant ID: ${variantId} for Tenant: ${tenantId}`);

    const variantRepo = manager.getRepository(ProductVariant);
    const imageRepo = manager.getRepository(ProductImage);

    const variant = await variantRepo.findOne({
      where: { id: variantId, tenantId },
      relations: { images: true },
    });

    if (!variant) {
      this.logger.warn(`Variant update failed: Variant ID ${variantId} not found for Tenant ${tenantId}`);
      throw new AppException(ErrorCode.VariantNotFound, 'Variante no encontrada.', HttpStatus.NOT_FOUND, { variantId });
    }

    let skuChanged = false;
    // Check SKU uniqueness if changed
    if (sku !== undefined && sku !== variant.sku) {
      const existingWithSku = await variantRepo.findOne({
        where: {
          sku,
          tenantId,
          id: Not(variantId),
        },
      });

      if (existingWithSku) {
        throw new AppException(ErrorCode.SkuTaken, `El SKU "${sku}" ya está registrado en otra variante.`, HttpStatus.CONFLICT, { sku });
      }
      await assertSkusDoNotShadowBaseSku(manager, tenantId, [sku], variant.productId);
      variant.sku = sku;
      skuChanged = true;
    }

    if (barcode !== undefined) variant.barcode = barcode;
    if (purchasePrice !== undefined) variant.purchasePrice = Number(purchasePrice) || 0;
    if (salePrice !== undefined) variant.salePrice = Number(salePrice) || 0;
    if (wholesalePrice !== undefined) {
      variant.wholesalePrice = wholesalePrice !== null ? Number(wholesalePrice) : null;
    }

    if (imageIds !== undefined) {
      if (imageIds.length > 0) {
        const images = await imageRepo.find({
          where: { id: In(imageIds), tenantId },
        });
        if (images.length !== imageIds.length) {
          throw new AppException(ErrorCode.ImagesNotFound, 'Una o más imágenes de la variante no existen.', HttpStatus.NOT_FOUND);
        }
        variant.images = images;
      } else {
        variant.images = [];
      }
    }

    const savedVariant = await variantRepo.save(variant);
    if (skuChanged) {
      // En un producto simple el SKU base es el SKU de su única variante: se mantienen juntos
      await manager.getRepository(Product).update({ id: savedVariant.productId, tenantId, type: ProductType.SIMPLE }, { baseSku: savedVariant.sku.trim().toUpperCase() });
    }
    this.logger.log(`Variant updated successfully: ID ${savedVariant.id}`);
    return savedVariant;
  }
}
