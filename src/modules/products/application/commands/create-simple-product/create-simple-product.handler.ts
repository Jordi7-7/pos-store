import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { In, EntityManager } from 'typeorm';
import { CreateSimpleProductCommand } from './create-simple-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductImage } from '../../../domain/entities/product-image.entity';
import { Category } from '../../../domain/entities/category.entity';
import { ProductBatch } from '../../../domain/entities/product-batch.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';


@CommandHandler(CreateSimpleProductCommand)
export class CreateSimpleProductHandler implements ICommandHandler<CreateSimpleProductCommand> {
  private readonly logger = new Logger(CreateSimpleProductHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: CreateSimpleProductCommand): Promise<Product> {
    const {
      tenantId,
      name,
      description,
      sku,
      barcode,
      purchasePrice,
      salePrice,
      categoryId,
      imageIds,
      stocks,
    } = command;

    this.logger.log(`Creating simple product: ${name} for Tenant: ${tenantId}`);

    return this.entityManager.transaction(async (transactionalManager) => {
      const productRepo = transactionalManager.getRepository(Product);
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const imageRepo = transactionalManager.getRepository(ProductImage);
      const categoryRepo = transactionalManager.getRepository(Category);
      const batchRepo = transactionalManager.getRepository(ProductBatch);
      const movementRepo = transactionalManager.getRepository(InventoryMovement);
      const branchRepo = transactionalManager.getRepository(Branch);

      // Validate branch existence for stocks
      if (stocks && stocks.length > 0) {
        for (const stockDto of stocks) {
          const branchExists = await branchRepo.findOne({
            where: { id: stockDto.branchId, tenantId },
          });
          if (!branchExists) {
            throw new BadRequestException(`La sucursal con ID "${stockDto.branchId}" no existe o no pertenece al inquilino.`);
          }
        }
      }

      // Validate SKU uniqueness globally or per tenant (now per tenant)
      const isSkuTaken = await variantRepo.findOne({
        where: { sku, tenantId },
      });
      if (isSkuTaken) {
        throw new BadRequestException(`El SKU "${sku}" ya está registrado en el sistema.`);
      }

      const product = new Product();
      product.tenantId = tenantId;
      product.name = name;
      product.description = description;

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

      // Create the single default variant for this simple product
      const variant = new ProductVariant();
      variant.product = savedProduct;
      variant.tenantId = tenantId;
      variant.sku = sku;
      variant.barcode = barcode || '';
      variant.purchasePrice = Number(purchasePrice) || 0;
      variant.salePrice = Number(salePrice) || 0;
      variant.attributeValues = [];
      variant.images = product.images; // Default variant shares the same images


      // Set initial stocks
      variant.stocks = [];
      if (stocks && stocks.length > 0) {
        for (const stockDto of stocks) {
          const stock = new ProductStock();
          stock.branchId = stockDto.branchId;
          stock.quantity = Number(stockDto.quantity) || 0;
          variant.stocks.push(stock);
        }
      }


      const savedVariant = await variantRepo.save(variant);

      // Save initial batches and inventory movements if quantity > 0
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

      if (savedVariant) {
        delete (savedVariant as any).product;
      }
      savedProduct.variants = [savedVariant];
      this.logger.log(`Simple product created successfully: ${savedProduct.name} (ID: ${savedProduct.id})`);

      return savedProduct;
    });
  }

}
