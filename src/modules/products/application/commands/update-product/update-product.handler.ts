import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { UpdateProductCommand } from './update-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand> {
  private readonly logger = new Logger(UpdateProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: UpdateProductCommand): Promise<Product> {
    const { tenantId, id, name, description, imageIds, categoryId, variants } = command;
    this.logger.log(`Updating product ID: ${id} for Tenant: ${tenantId}`);

    const productRepo = this.entityManager.getRepository(Product);
    const imageRepo = this.entityManager.getRepository(ProductImage);
    const categoryRepo = this.entityManager.getRepository(Category);
    const variantRepo = this.entityManager.getRepository(ProductVariant);
    const attribValueRepo = this.entityManager.getRepository(AttributeValue);

    const product = await productRepo.findOne({
      where: { id, tenantId },
      relations: { images: true },
    });

    if (!product) {
      this.logger.warn(`Product update failed: Product ID ${id} not found for Tenant ${tenantId}`);
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;

    // Update Category if provided
    if (categoryId !== undefined) {
      if (categoryId === null || categoryId === '') {
        product.categoryId = null;
      } else {
        const category = await categoryRepo.findOne({
          where: { id: categoryId, tenantId },
        });
        if (!category) {
          this.logger.warn(`Product update failed: Category ID ${categoryId} not found for Tenant ${tenantId}`);
          throw new NotFoundException(`Category with ID ${categoryId} not found`);
        }
        product.categoryId = categoryId;
      }
    }

    if (imageIds !== undefined) {
      if (imageIds.length > 0) {
        const images = await imageRepo.find({
          where: { id: In(imageIds), tenantId },
        });
        if (images.length !== imageIds.length) {
          this.logger.warn(`Product update failed: some parent image IDs from [${imageIds}] were not found for Tenant ${tenantId}`);
          throw new BadRequestException('Some product images were not found');
        }
        product.images = images;
      } else {
        product.images = [];
      }
    }

    // Sync Variants if provided
    if (variants !== undefined) {
      this.logger.log(`Syncing variants: ${variants.length} received in DTO`);

      // 1. Validate no duplicate attribute combinations in input variants
      for (const variantDto of variants) {
        if (!variantDto.attributeValues) continue;
        const key = variantDto.attributeValues.map((av: any) => av.attributeValueId).sort().join(',');
        
        const duplicates = variants.filter(v => {
          if (!v.attributeValues) return false;
          const k = v.attributeValues.map((av: any) => av.attributeValueId).sort().join(',');
          return k === key;
        });

        if (duplicates.length > 1) {
          throw new BadRequestException('No se permiten múltiples variantes con la misma combinación de atributos.');
        }
      }

      // 2. Fetch existing variants of this product
      const existingVariants = await variantRepo.find({
        where: { productId: product.id },
        relations: { attributeValues: true, stocks: true, images: true }
      });

      const updatedVariants: ProductVariant[] = [];

      for (const variantDto of variants) {
        // Find existing variant by ID (if provided) or SKU
        let variant = existingVariants.find(v => 
          (variantDto.id && v.id === variantDto.id) || 
          v.sku.toLowerCase() === variantDto.sku.toLowerCase()
        );

        if (!variant) {
          variant = new ProductVariant();
          variant.product = product;
          variant.stocks = [];
        }

        variant.sku = variantDto.sku;
        variant.barcode = variantDto.barcode || '';
        variant.purchasePrice = Number(variantDto.purchasePrice) || 0;
        variant.salePrice = Number(variantDto.salePrice) || 0;

        // Sync variant images
        if (variantDto.imageIds !== undefined) {
          if (variantDto.imageIds.length > 0) {
            const varImages = await imageRepo.find({
              where: { id: In(variantDto.imageIds), tenantId }
            });
            variant.images = varImages;
          } else {
            variant.images = [];
          }
        }

        // Sync attribute values
        if (variantDto.attributeValues !== undefined) {
          const valIds = variantDto.attributeValues.map((av: any) => av.attributeValueId);
          if (valIds.length > 0) {
            const attrValues = await attribValueRepo.find({
              where: { id: In(valIds), attribute: { tenantId } }
            });
            variant.attributeValues = attrValues;
          } else {
            variant.attributeValues = [];
          }
        }

        // Sync stocks (we assume standard stock update)
        if (variantDto.stocks !== undefined) {
          for (const stockDto of variantDto.stocks) {
            let stock = variant.stocks.find(s => s.branchId === stockDto.branchId);
            if (!stock) {
              stock = new ProductStock();
              stock.variant = variant;
              stock.branchId = stockDto.branchId;
              variant.stocks.push(stock);
            }
            stock.quantity = Number(stockDto.quantity) || 0;
          }
        }

        updatedVariants.push(variant);
      }

      // Identify variants to delete
      const idsToKeep = updatedVariants.map(v => v.id).filter(Boolean);
      const skusToKeep = updatedVariants.map(v => v.sku.toLowerCase());

      const variantsToDelete = existingVariants.filter(v => 
        !idsToKeep.includes(v.id) && !skusToKeep.includes(v.sku.toLowerCase())
      );

      if (variantsToDelete.length > 0) {
        for (const vToDelete of variantsToDelete) {
          const varStock = vToDelete.stocks?.reduce((sum, s) => sum + s.quantity, 0) || 0;
          if (varStock > 0) {
            throw new BadRequestException(
              `No se puede eliminar la variante "${vToDelete.sku}" porque tiene stock disponible en inventario (${varStock} pzs). Ajusta el stock a 0 primero.`,
            );
          }
        }
        this.logger.log(`Removing ${variantsToDelete.length} orphaned variants`);
        await variantRepo.remove(variantsToDelete);
      }

      product.variants = updatedVariants;
    }

    const savedProduct = await productRepo.save(product);
    this.logger.log(`Product updated successfully: ID ${savedProduct.id}`);

    return savedProduct;
  }
}
