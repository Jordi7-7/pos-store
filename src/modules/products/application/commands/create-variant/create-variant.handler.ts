import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { CreateVariantCommand } from './create-variant.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { AttributeValue } from '../../../domain/entities/attribute-value.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { ProductBatch } from '../../../domain/entities/product-batch.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';

@CommandHandler(CreateVariantCommand)
export class CreateVariantHandler implements ICommandHandler<CreateVariantCommand> {
  private readonly logger = new Logger(CreateVariantHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateVariantCommand): Promise<ProductVariant> {
    const { tenantId, productId, variantDto } = command;
    this.logger.log(`Creating variant for product ${productId} under Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const productRepo = transactionalManager.getRepository(Product);
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const attributeValueRepo = transactionalManager.getRepository(AttributeValue);
      const imageRepo = transactionalManager.getRepository(ProductImage);
      const batchRepo = transactionalManager.getRepository(ProductBatch);

      // Validate product exists
      const product = await productRepo.findOne({
        where: { id: productId, tenantId },
        relations: { variants: { attributeValues: true } },
      });
      if (!product) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      // Validate SKU uniqueness per tenant
      const isSkuTaken = await variantRepo.findOne({
        where: { sku: variantDto.sku, tenantId },
      });
      if (isSkuTaken) {
        throw new BadRequestException(`El SKU "${variantDto.sku}" ya está registrado en el sistema.`);
      }

      // Validate no duplicate attribute combinations in existing product variants
      const valueIds = variantDto.attributeValues?.map((v: any) => v.attributeValueId) || [];
      const newCombinationKey = [...valueIds].sort().join(',');

      if (newCombinationKey) {
        for (const existingVariant of product.variants) {
          const existingKey = existingVariant.attributeValues
            ?.map((av) => av.id)
            .sort()
            .join(',') || '';
          if (existingKey === newCombinationKey) {
            throw new BadRequestException('Ya existe una variante con la misma combinación de atributos para este producto.');
          }
        }
      }

      // Create new variant
      const variant = new ProductVariant();
      variant.product = product;
      variant.sku = variantDto.sku;
      variant.barcode = variantDto.barcode || '';
      variant.purchasePrice = Number(variantDto.purchasePrice) || 0;
      variant.salePrice = Number(variantDto.salePrice) || 0;
      variant.imageUrl = null;
      variant.tenantId = tenantId;


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

      // Save initial batches and movements
      if (savedVariant.stocks && savedVariant.stocks.length > 0) {
        const movementRepo = transactionalManager.getRepository(InventoryMovement);
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
            await batchRepo.save(batch);

            const movement = new InventoryMovement();
            movement.tenantId = tenantId;
            movement.originBranchId = null;
            movement.destinationBranchId = stock.branchId;
            movement.variantId = savedVariant.id;
            movement.purchaseOrderId = null;
            movement.quantity = Number(stock.quantity);
            movement.type = 'INPUT';
            movement.reason = 'INITIAL_STOCK';
            await movementRepo.save(movement);
          }
        }
      }

      return savedVariant;
    });
  }
}
