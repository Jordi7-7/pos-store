import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { CreateVariableProductCommand } from './create-variable-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';
import { ProductBatch } from '../../../domain/entities/product-batch.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';


@CommandHandler(CreateVariableProductCommand)
export class CreateVariableProductHandler implements ICommandHandler<CreateVariableProductCommand> {
  private readonly logger = new Logger(CreateVariableProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateVariableProductCommand): Promise<Product> {
    const { tenantId, name, description, variants, imageIds, categoryId } = command;
    this.logger.log(`Creating variable product: ${name} with ${variants.length} variant(s) for Tenant: ${tenantId}`);

    if (!variants || variants.length === 0) {
      throw new BadRequestException('Un producto variable debe tener al menos una variante.');
    }

    // Validate no duplicate attribute combinations in input variants
    const combinationSet = new Set<string>();
    for (const variantDto of variants) {
      const attributeValueIds = variantDto.attributeValues
        ?.map((av: any) => av.attributeValueId)
        .sort()
        .join(',') || '';

      if (attributeValueIds) {
        if (combinationSet.has(attributeValueIds)) {
          throw new BadRequestException('No se permiten múltiples variantes con la misma combinación de atributos en un mismo producto.');
        }
        combinationSet.add(attributeValueIds);
      }
    }

    return this.entityManager.transaction(async (transactionalManager) => {
      const productRepo = transactionalManager.getRepository(Product);
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const attributeValueRepo = transactionalManager.getRepository(AttributeValue);
      const imageRepo = transactionalManager.getRepository(ProductImage);
      const categoryRepo = transactionalManager.getRepository(Category);
      const batchRepo = transactionalManager.getRepository(ProductBatch);
      const movementRepo = transactionalManager.getRepository(InventoryMovement);
      const branchRepo = transactionalManager.getRepository(Branch);

      // Validate all branch IDs belong to tenant
      for (const variantDto of variants) {
        if (variantDto.stocks && variantDto.stocks.length > 0) {
          for (const stockDto of variantDto.stocks) {
            const branchExists = await branchRepo.findOne({
              where: { id: stockDto.branchId, tenantId },
            });
            if (!branchExists) {
              throw new BadRequestException(`La sucursal con ID "${stockDto.branchId}" no existe o no pertenece al inquilino.`);
            }
          }
        }
      }

      // Validate all SKU uniqueness per tenant
      const skusToCheck = variants.map(v => v.sku);
      const existingSkuCount = await variantRepo.count({
        where: { sku: In(skusToCheck), tenantId },
      });
      if (existingSkuCount > 0) {
        throw new BadRequestException('Uno o más SKUs ya están registrados en el sistema para este inquilino.');
      }


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
          throw new BadRequestException('Some product images were not found');
        }
        product.images = images;
      } else {
        product.images = [];
      }

      const savedProduct = await productRepo.save(product);
      const savedVariants: ProductVariant[] = [];

      for (const variantDto of variants) {
        const variant = new ProductVariant();
        variant.product = savedProduct;
        variant.tenantId = tenantId;
        variant.sku = variantDto.sku;
        variant.barcode = variantDto.barcode || '';
        variant.purchasePrice = Number(variantDto.purchasePrice) || 0;
        variant.salePrice = Number(variantDto.salePrice) || 0;


        // Link variant images
        if (variantDto.imageIds && variantDto.imageIds.length > 0) {
          const varImages = await imageRepo.find({
            where: { id: In(variantDto.imageIds), tenantId },
          });
          variant.images = varImages;
        } else {
          variant.images = [];
        }

        // Link attribute values
        const valueIds = variantDto.attributeValues?.map((v: any) => v.attributeValueId) || [];
        if (valueIds.length > 0) {
          const attributeValues = await attributeValueRepo.find({
            where: {
              id: In(valueIds),
              attribute: { tenantId },
            },
            relations: { attribute: true },
          });
          if (attributeValues.length !== valueIds.length) {
            throw new BadRequestException('Some variant attribute values were not found');
          }
          variant.attributeValues = attributeValues;
        } else {
          variant.attributeValues = [];
        }

        // Set initial stocks
        variant.stocks = [];
        if (variantDto.stocks) {
          for (const stockDto of variantDto.stocks) {
            const stock = new ProductStock();
            stock.branchId = stockDto.branchId;
            stock.quantity = Number(stockDto.quantity) || 0;
            variant.stocks.push(stock);
          }
        }

        const savedVariant = await variantRepo.save(variant);
        savedVariants.push(savedVariant);

        // Save initial batches and movements
        const batchesToSave: ProductBatch[] = [];
        const movementsToSave: InventoryMovement[] = [];

        for (const stock of savedVariant.stocks) {
          if (Number(stock.quantity) > 0) {
            const batch = new ProductBatch();
            batch.tenantId = tenantId;
            batch.branchId = stock.branchId;
            batch.variantId = savedVariant.id;
            batch.purchaseOrderId = null;
            batch.initialQuantity = Number(stock.quantity);
            batch.remainingQuantity = Number(stock.quantity);
            batch.unitCost = Number(savedVariant.purchasePrice);
            batchesToSave.push(batch);

            const movement = new InventoryMovement();
            movement.tenantId = tenantId;
            movement.originBranchId = null;
            movement.destinationBranchId = stock.branchId;
            movement.variantId = savedVariant.id;
            movement.purchaseOrderId = null;
            movement.quantity = Number(stock.quantity);
            movement.type = 'IN';
            movement.reason = InventoryMovementReason.INITIAL_STOCK;
            movementsToSave.push(movement);
          }
        }

        if (batchesToSave.length > 0) {
          await batchRepo.save(batchesToSave);
        }
        if (movementsToSave.length > 0) {
          await movementRepo.save(movementsToSave);
        }
      }

      for (const variant of savedVariants) {
        delete (variant as any).product;
      }
      savedProduct.variants = savedVariants;
      this.logger.log(`Variable product created successfully: ${savedProduct.name} (ID: ${savedProduct.id})`);
      return savedProduct;
    });
  }

}
