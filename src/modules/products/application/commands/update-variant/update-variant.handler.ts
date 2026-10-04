import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, In, Not } from 'typeorm';
import { UpdateVariantCommand } from './update-variant.command';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';

@CommandHandler(UpdateVariantCommand)
export class UpdateVariantHandler implements ICommandHandler<UpdateVariantCommand> {
  private readonly logger = new Logger(UpdateVariantHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateVariantCommand): Promise<ProductVariant> {
    const {
      tenantId,
      variantId,
      sku,
      barcode,
      purchasePrice,
      salePrice,
      wholesalePrice,
      imageIds,
    } = command;

    this.logger.log(`Updating variant ID: ${variantId} for Tenant: ${tenantId}`);

    const variantRepo = this.entityManager.getRepository(ProductVariant);
    const imageRepo = this.entityManager.getRepository(ProductImage);

    const variant = await variantRepo.findOne({
      where: { id: variantId, tenantId },
      relations: { images: true },
    });

    if (!variant) {
      this.logger.warn(`Variant update failed: Variant ID ${variantId} not found for Tenant ${tenantId}`);
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

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
        throw new BadRequestException(`El SKU "${sku}" ya está registrado en otra variante.`);
      }
      variant.sku = sku;
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
          throw new BadRequestException('Some variant images were not found');
        }
        variant.images = images;
      } else {
        variant.images = [];
      }
    }

    try {
      const savedVariant = await variantRepo.save(variant);
      this.logger.log(`Variant updated successfully: ID ${savedVariant.id}`);
      return savedVariant;
    } catch (error: any) {
      if (error?.code === '23505' || error?.driverError?.code === '23505') {
        throw new BadRequestException('El SKU o código ingresado ya está en uso por otra variante.');
      }
      throw error;
    }
  }
}
