import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { ImportProductsCommand } from './import-products.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductBatch } from '../../../domain/entities/product-batch.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';

@CommandHandler(ImportProductsCommand)
export class ImportProductsHandler implements ICommandHandler<ImportProductsCommand> {
  private readonly logger = new Logger(ImportProductsHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: ImportProductsCommand): Promise<{ importedCount: number }> {
    const { tenantId, branchId, items } = command;
    this.logger.log(`Executing bulk product import: ${items.length} items for Tenant: ${tenantId}`);

    if (items.length === 0) {
      throw new BadRequestException('No se proporcionaron productos para importar.');
    }

    return this.entityManager.transaction(async (tm) => {
      const productRepo = tm.getRepository(Product);
      const variantRepo = tm.getRepository(ProductVariant);
      const stockRepo = tm.getRepository(ProductStock);
      const batchRepo = tm.getRepository(ProductBatch);
      const movementRepo = tm.getRepository(InventoryMovement);
      const branchRepo = tm.getRepository(Branch);

      // Verify branch if branchId is provided
      if (branchId) {
        const branch = await branchRepo.findOne({ where: { id: branchId, tenantId } });
        if (!branch) {
          throw new NotFoundException(`La sucursal destino con ID ${branchId} no existe.`);
        }
      }

      // Check if any SKU already exists in this Tenant
      const skus = items.map((it) => it.sku.trim());
      const existingVariants = await variantRepo.find({
        where: { sku: In(skus), tenantId },
      });

      if (existingVariants.length > 0) {
        const dupSkus = existingVariants.map((v) => v.sku).join(', ');
        throw new BadRequestException(`Los siguientes SKUs ya existen en el sistema: ${dupSkus}`);
      }

      let importedCount = 0;

      for (const itemDto of items) {
        const trimmedSku = itemDto.sku.trim();
        const trimmedName = itemDto.name.trim();

        // 1. Create Product
        const product = new Product();
        product.tenantId = tenantId;
        product.name = trimmedName;
        product.description = '';
        const savedProduct = await productRepo.save(product);

        // 2. Create ProductVariant
        const variant = new ProductVariant();
        variant.product = savedProduct;
        variant.tenantId = tenantId;
        variant.sku = trimmedSku;
        variant.barcode = itemDto.barcode?.trim() || '';
        variant.purchasePrice = Number(itemDto.purchasePrice) || 0;
        variant.salePrice = Number(itemDto.salePrice) || 0;
        variant.attributeValues = [];
        const savedVariant = await variantRepo.save(variant);

        // 3. Create ProductStock & Batch if quantity > 0 and branchId is present
        if (Number(itemDto.quantity) > 0 && branchId) {
          const stock = new ProductStock();
          stock.branchId = branchId;
          stock.variantId = savedVariant.id;
          stock.quantity = Number(itemDto.quantity);
          await stockRepo.save(stock);

          const batch = new ProductBatch();
          batch.tenantId = tenantId;
          batch.branchId = branchId;
          batch.variantId = savedVariant.id;
          batch.purchaseOrderId = null;
          batch.initialQuantity = Number(itemDto.quantity);
          batch.remainingQuantity = Number(itemDto.quantity);
          batch.unitCost = Number(savedVariant.purchasePrice);
          await batchRepo.save(batch);

          const movement = new InventoryMovement();
          movement.tenantId = tenantId;
          movement.originBranchId = null;
          movement.destinationBranchId = branchId;
          movement.variantId = savedVariant.id;
          movement.purchaseOrderId = null;
          movement.quantity = Number(itemDto.quantity);
          movement.type = 'IN';
          movement.reason = InventoryMovementReason.INITIAL_STOCK;
          await movementRepo.save(movement);
        }

        importedCount++;
      }

      return { importedCount };
    });
  }
}
