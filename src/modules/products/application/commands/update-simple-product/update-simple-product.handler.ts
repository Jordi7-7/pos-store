import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, In, Not } from 'typeorm';
import { UpdateSimpleProductCommand } from './update-simple-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';

@CommandHandler(UpdateSimpleProductCommand)
export class UpdateSimpleProductHandler implements ICommandHandler<UpdateSimpleProductCommand> {
  private readonly logger = new Logger(UpdateSimpleProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateSimpleProductCommand): Promise<Product> {
    const {
      tenantId,
      id,
      name,
      description,
      categoryId,
      imageIds,
      sku,
      barcode,
      purchasePrice,
      salePrice,
      wholesalePrice,
    } = command;

    this.logger.log(`Updating simple product ID: ${id} for Tenant: ${tenantId}`);

    const productRepo = this.entityManager.getRepository(Product);
    const imageRepo = this.entityManager.getRepository(ProductImage);
    const categoryRepo = this.entityManager.getRepository(Category);
    const variantRepo = this.entityManager.getRepository(ProductVariant);

    // 1. Fetch existing product with its images and variants
    const product = await productRepo.findOne({
      where: { id, tenantId },
      relations: { images: true, variants: { images: true } },
    });

    if (!product) {
      this.logger.warn(`Product update failed: Product ID ${id} not found for Tenant ${tenantId}`);
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;

    // 2. Update Category
    if (categoryId !== undefined) {
      if (categoryId === null || categoryId === '') {
        product.categoryId = null;
      } else {
        const category = await categoryRepo.findOne({
          where: { id: categoryId, tenantId },
        });
        if (!category) {
          throw new NotFoundException(`Category with ID ${categoryId} not found`);
        }
        product.categoryId = categoryId;
      }
    }

    // 3. Update Images
    if (imageIds !== undefined) {
      if (imageIds.length > 0) {
        const images = await imageRepo.find({
          where: { id: In(imageIds), tenantId },
        });
        if (images.length !== imageIds.length) {
          throw new BadRequestException('Some product images were not found');
        }
        product.images = images;
      } else {
        product.images = [];
      }
    }

    // 4. Update Variant (for simple products, the single default variant)
    let variant = product.variants?.[0];
    if (!variant) {
      variant = new ProductVariant();
      variant.product = product;
      variant.tenantId = tenantId;
      variant.stocks = [];
      variant.attributeValues = [];
    }

    // Check SKU uniqueness if changed
    if (sku !== undefined && sku !== variant.sku) {
      const existingWithSku = await variantRepo.findOne({
        where: {
          sku,
          tenantId,
          productId: Not(product.id),
        },
      });

      if (existingWithSku) {
        throw new BadRequestException(`El SKU "${sku}" ya está registrado en otro producto del sistema.`);
      }
      variant.sku = sku;
    }

    if (barcode !== undefined) variant.barcode = barcode;
    if (purchasePrice !== undefined) variant.purchasePrice = Number(purchasePrice) || 0;
    if (salePrice !== undefined) variant.salePrice = Number(salePrice) || 0;
    if (wholesalePrice !== undefined) {
      variant.wholesalePrice = wholesalePrice !== null ? Number(wholesalePrice) : null;
    }

    // Keep images aligned with parent product
    if (imageIds !== undefined) {
      variant.images = product.images;
    }

    try {
      const savedVariant = await variantRepo.save(variant);
      product.variants = [savedVariant];
      const savedProduct = await productRepo.save(product);

      this.logger.log(`Simple product updated successfully: ID ${savedProduct.id}`);
      return savedProduct;
    } catch (error: any) {
      if (error?.code === '23505' || error?.driverError?.code === '23505') {
        throw new BadRequestException('El SKU o código ingresado ya está en uso por otro producto.');
      }
      throw error;
    }
  }
}
