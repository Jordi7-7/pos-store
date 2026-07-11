import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { CreateProductCommand } from './create-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';
import { ProductBatch } from '../../../domain/entities/product-batch.entity';

@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand> {
  private readonly logger = new Logger(CreateProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateProductCommand): Promise<Product> {
    const { tenantId, name, description, variants, imageIds, categoryId } = command;
    this.logger.log(`Creating product: ${name} with ${variants.length} variant(s) for Tenant: ${tenantId}`);
    return this.entityManager.transaction(async (transactionalManager) => {
      const productRepo = transactionalManager.getRepository(Product);
      const attributeValueRepo = transactionalManager.getRepository(AttributeValue);
      const imageRepo = transactionalManager.getRepository(ProductImage);
      const categoryRepo = transactionalManager.getRepository(Category);
      const batchRepo = transactionalManager.getRepository(ProductBatch);

      const product = new Product();
      product.tenantId = tenantId;
      product.name = name;
      product.description = description;
      product.variants = [];

      // Link Category if provided
      if (categoryId) {
        const category = await categoryRepo.findOne({
          where: { id: categoryId, tenantId },
        });
        if (!category) {
          this.logger.warn(`Product creation failed: Category ID ${categoryId} not found for Tenant ${tenantId}`);
          throw new NotFoundException(`Category with ID ${categoryId} not found`);
        }
        product.categoryId = categoryId;
      } else {
        product.categoryId = null;
      }

      // Link parent product images
      if (imageIds && imageIds.length > 0) {
        const images = await imageRepo.find({
          where: { id: In(imageIds), tenantId },
        });
        if (images.length !== imageIds.length) {
          this.logger.warn(`Product creation failed: some parent image IDs from [${imageIds}] were not found for Tenant ${tenantId}`);
          throw new BadRequestException('Some product images were not found');
        }
        product.images = images;
      } else {
        product.images = [];
      }

      for (const variantDto of variants) {
        const variant = new ProductVariant();
        variant.sku = variantDto.sku;
        variant.barcode = variantDto.barcode;
        variant.purchasePrice = variantDto.purchasePrice;
        variant.salePrice = variantDto.salePrice;
        variant.imageUrl = null; // Deprecated, using images relation instead

        // Link variant images
        if (variantDto.imageIds && variantDto.imageIds.length > 0) {
          const varImages = await imageRepo.find({
            where: { id: In(variantDto.imageIds), tenantId },
          });
          if (varImages.length !== variantDto.imageIds.length) {
            this.logger.warn(`Product creation failed: some variant image IDs from [${variantDto.imageIds}] were not found for Tenant ${tenantId}`);
            throw new BadRequestException('Some variant images were not found');
          }
          variant.images = varImages;
        } else {
          variant.images = [];
        }

        const valueIds = variantDto.attributeValues.map((v: any) => v.attributeValueId);
        if (valueIds.length > 0) {
          const attributeValues = await attributeValueRepo.find({
            where: {
              id: In(valueIds),
              attribute: { tenantId },
            },
            relations: { attribute: true },
          });
          if (attributeValues.length !== valueIds.length) {
            this.logger.warn(`Product creation failed: some attribute values from IDs [${valueIds}] were not found or belong to another tenant`);
            throw new BadRequestException('Some variant attribute values were not found');
          }
          variant.attributeValues = attributeValues;
        } else {
          variant.attributeValues = [];
        }

        variant.stocks = [];
        if (variantDto.stocks) {
          for (const stockDto of variantDto.stocks) {
            const stock = new ProductStock();
            stock.branchId = stockDto.branchId;
            stock.quantity = stockDto.quantity;
            variant.stocks.push(stock);
          }
        }

        product.variants.push(variant);
      }

      const savedProduct = await productRepo.save(product);

      // Guardar lotes iniciales si hay existencias iniciales
      const batchesToSave: ProductBatch[] = [];
      for (const variant of savedProduct.variants) {
        if (variant.stocks && variant.stocks.length > 0) {
          for (const stock of variant.stocks) {
            if (Number(stock.quantity) > 0) {
              const batch = new ProductBatch();
              batch.tenantId = tenantId;
              batch.branchId = stock.branchId;
              batch.variantId = variant.id;
              batch.purchaseOrderId = null;
              batch.initialQuantity = Number(stock.quantity);
              batch.remainingQuantity = Number(stock.quantity);
              batch.unitCost = Number(variant.purchasePrice);
              batchesToSave.push(batch);
            }
          }
        }
      }
      if (batchesToSave.length > 0) {
        await batchRepo.save(batchesToSave);
      }

      this.logger.log(`Product created successfully: ${savedProduct.name} (ID: ${savedProduct.id})`);
      return savedProduct;
    });
  }
}
