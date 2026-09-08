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
        select: { sku: true },
      });

      if (existingVariants.length > 0) {
        const dupSkus = existingVariants.map((v) => v.sku).slice(0, 10).join(', ');
        const extraCount = existingVariants.length > 10 ? ` y ${existingVariants.length - 10} más` : '';
        throw new BadRequestException(`Los siguientes SKUs ya existen en el sistema: ${dupSkus}${extraCount}`);
      }

      // Batch processing in chunks for high performance and low memory footprint
      const CHUNK_SIZE = 250;
      let totalImported = 0;

      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);

        // 1. Bulk create Products for chunk
        const productsToCreate = chunk.map((item) => {
          const prod = new Product();
          prod.tenantId = tenantId;
          prod.name = item.name.trim();
          prod.description = '';
          return prod;
        });
        const savedProducts = await productRepo.save(productsToCreate);

        // 2. Bulk create Variants for chunk
        const variantsToCreate = chunk.map((item, idx) => {
          const variant = new ProductVariant();
          variant.productId = savedProducts[idx].id;
          variant.tenantId = tenantId;
          variant.sku = item.sku.trim();
          variant.barcode = item.barcode?.trim() || '';
          variant.purchasePrice = Number(item.purchasePrice) || 0;
          variant.salePrice = Number(item.salePrice) || 0;
          variant.wholesalePrice = item.wholesalePrice !== undefined && item.wholesalePrice !== null && Number(item.wholesalePrice) > 0
            ? Number(item.wholesalePrice)
            : null;
          variant.attributeValues = [];
          return variant;
        });
        const savedVariants = await variantRepo.save(variantsToCreate);

        // 3. Bulk create Stocks, Batches and Movements if stock is provided and branchId is present
        if (branchId) {
          const stocksToCreate: ProductStock[] = [];
          const batchesToCreate: ProductBatch[] = [];
          const movementsToCreate: InventoryMovement[] = [];

          chunk.forEach((item, idx) => {
            const qty = Number(item.quantity);
            if (qty > 0) {
              const variantId = savedVariants[idx].id;
              const purchasePrice = Number(savedVariants[idx].purchasePrice) || 0;

              const stock = new ProductStock();
              stock.branchId = branchId;
              stock.variantId = variantId;
              stock.quantity = qty;
              stocksToCreate.push(stock);

              const batch = new ProductBatch();
              batch.tenantId = tenantId;
              batch.branchId = branchId;
              batch.variantId = variantId;
              batch.purchaseOrderId = null;
              batch.initialQuantity = qty;
              batch.remainingQuantity = qty;
              batch.unitCost = purchasePrice;
              batchesToCreate.push(batch);

              const movement = new InventoryMovement();
              movement.tenantId = tenantId;
              movement.originBranchId = null;
              movement.destinationBranchId = branchId;
              movement.variantId = variantId;
              movement.purchaseOrderId = null;
              movement.quantity = qty;
              movement.type = 'IN';
              movement.reason = InventoryMovementReason.INITIAL_STOCK;
              movementsToCreate.push(movement);
            }
          });

          if (stocksToCreate.length > 0) {
            await stockRepo.save(stocksToCreate);
            await batchRepo.save(batchesToCreate);
            await movementRepo.save(movementsToCreate);
          }
        }

        totalImported += chunk.length;
      }

      return { importedCount: totalImported };
    });
  }
}
