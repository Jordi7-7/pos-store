import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { ImportProductsCommand } from './import-products.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { ProductStock } from '../../../domain/entities/product-stock.entity';
import { ProductBatch } from '../../../domain/entities/product-batch.entity';
import { Batch, BatchOriginType } from '../../../../batches/domain/entities/batch.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { findBranchOrFail } from '../../../../branches/application/services/branch-lookup';
import { InventoryMovementCategory } from '../../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';
import { newKardexLine } from '../../services/kardex';
import { ProductType } from '../../../domain/enums/product-type.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { repeatedSkus } from './repeated-skus';
import { translatingSkuConflict } from '../../services/sku-conflict';
import { normalizeSku } from '../../../domain/sku';

export interface ImportProductsResult {
  importedCount: number;
}

@CommandHandler(ImportProductsCommand)

export class ImportProductsHandler implements ICommandHandler<ImportProductsCommand> {
  private readonly logger = new Logger(ImportProductsHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  execute(command: ImportProductsCommand): Promise<ImportProductsResult> {
    return translatingSkuConflict(() => this.run(command));
  }

  private async run(command: ImportProductsCommand): Promise<ImportProductsResult> {
    const { tenantId, userId, branchId, items } = command;
    this.logger.log(`Executing bulk product import: ${items.length} items for Tenant: ${tenantId}`);

    if (items.length === 0) {
      throw new AppException(ErrorCode.ImportEmpty, 'No se proporcionaron productos para importar.', HttpStatus.BAD_REQUEST);
    }

    if (items.length > 3000) {
      throw new AppException(ErrorCode.ImportLimitExceeded, `El archivo contiene ${items.length} productos. El límite máximo permitido por importación es de 3,000 productos.`, HttpStatus.BAD_REQUEST, { received: items.length, max: 3000 });
    }

    return this.entityManager.transaction(async (tm) => {
      if (branchId) {
        await assertUserCanOperateInBranch(tm, this.redisService, {
          tenantId,
          userId,
          branchId,
          actionDescription: 'importar productos',
        });
      }

      // Después del control de acceso: no se procesa el contenido de quien no puede importar
      const repeated = repeatedSkus(items.map((item) => item.sku));
      if (repeated.length > 0) {
        throw new AppException(
          ErrorCode.DuplicateSkuInImport,
          `El archivo repite estos SKUs: ${repeated.slice(0, 10).join(', ')}`,
          HttpStatus.BAD_REQUEST,
          { skus: repeated },
        );
      }

      const productRepo = tm.getRepository(Product);
      const variantRepo = tm.getRepository(ProductVariant);
      const stockRepo = tm.getRepository(ProductStock);
      const batchRepo = tm.getRepository(ProductBatch);
      const movementRepo = tm.getRepository(InventoryMovement);

      // Verify branch if branchId is provided
      if (branchId) {
        await findBranchOrFail(tm, tenantId, branchId);
      }

      // Check if any SKU already exists in this Tenant (chunked to prevent Postgres param limits)
      const skus = items.map((it) => normalizeSku(it.sku));
      const duplicateSkus: string[] = [];
      const CHUNK_QUERY_SIZE = 500;

      for (let i = 0; i < skus.length; i += CHUNK_QUERY_SIZE) {
        const chunkSkus = skus.slice(i, i + CHUNK_QUERY_SIZE);
        const existingVariants = await variantRepo.find({
          where: { sku: In(chunkSkus), tenantId },
          select: { sku: true },
        });
        if (existingVariants.length > 0) {
          duplicateSkus.push(...existingVariants.map((v) => v.sku));
        }
      }

      if (duplicateSkus.length > 0) {
        const dupSkus = duplicateSkus.slice(0, 10).join(', ');
        const extraCount = duplicateSkus.length > 10 ? ` y ${duplicateSkus.length - 10} más` : '';
        throw new AppException(ErrorCode.SkuTaken, `Los siguientes SKUs ya existen en el sistema: ${dupSkus}${extraCount}`, HttpStatus.CONFLICT, { skus: duplicateSkus });
      }

      // Create a single physical Batch header for the entire import operation if branchId is present
      let savedBatchHeader: Batch | null = null;
      if (branchId) {
        const batchHeaderRepo = tm.getRepository(Batch);
        const batchHeader = new Batch();
        batchHeader.tenantId = tenantId;
        batchHeader.branchId = branchId;
        batchHeader.purchaseOrderId = null;
        batchHeader.code = `IMP-PROD-${Date.now().toString().slice(-6)}`;
        batchHeader.originType = BatchOriginType.INITIAL_STOCK;
        savedBatchHeader = await batchHeaderRepo.save(batchHeader);
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
          prod.type = ProductType.SIMPLE;
          prod.baseSku = normalizeSku(item.sku) || null;
          return prod;
        });
        const savedProducts = await productRepo.save(productsToCreate);

        // 2. Bulk create Variants for chunk
        const variantsToCreate = chunk.map((item, idx) => {
          const variant = new ProductVariant();
          variant.productId = savedProducts[idx].id;
          variant.tenantId = tenantId;
          variant.sku = normalizeSku(item.sku);
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

        // 3. Bulk create Stocks, Batches and Movements if branchId is present
        if (branchId) {
          const currentBatchHeader = savedBatchHeader;
          const stocksToCreate: ProductStock[] = [];
          const batchesToCreate: ProductBatch[] = [];
          const movementsToCreate: InventoryMovement[] = [];

          chunk.forEach((item, idx) => {
            const qty = Number(item.quantity);
            if (!isNaN(qty)) {
              const variantId = savedVariants[idx].id;
              const purchasePrice = Number(savedVariants[idx].purchasePrice) || 0;

              const stock = new ProductStock();
              stock.branchId = branchId;
              stock.variantId = variantId;
              stock.quantity = qty;
              stocksToCreate.push(stock);

              if (qty > 0 && currentBatchHeader) {
                const batch = new ProductBatch();
                batch.tenantId = tenantId;
                batch.branchId = branchId;
                batch.batchId = currentBatchHeader.id;
                batch.variantId = variantId;
                batch.initialQuantity = qty;
                batch.remainingQuantity = qty;
                batch.unitCost = purchasePrice;
                batchesToCreate.push(batch);

                movementsToCreate.push(
                  newKardexLine({ tenantId, variantId, quantity: qty, type: InventoryMovementType.IN, category: InventoryMovementCategory.INITIAL, reason: InventoryMovementReason.INITIAL_STOCK, branchId, unitCost: purchasePrice, balanceAfter: qty }),
                );
              } else if (qty < 0) {
                // Negative initial stock: deficit/debt in branch, recorded as OUT movement
                movementsToCreate.push(
                  newKardexLine({ tenantId, variantId, quantity: Math.abs(qty), type: InventoryMovementType.OUT, category: InventoryMovementCategory.INITIAL, reason: InventoryMovementReason.INITIAL_STOCK, branchId, unitCost: purchasePrice, balanceAfter: qty }),
                );
              }
            }
          });

          if (stocksToCreate.length > 0) {
            await stockRepo.save(stocksToCreate);
          }
          if (batchesToCreate.length > 0) {
            await batchRepo.save(batchesToCreate);
          }
          if (movementsToCreate.length > 0) {
            await movementRepo.save(movementsToCreate);
          }
        }

        totalImported += chunk.length;
      }

      return { importedCount: totalImported };
    });
  }
}
