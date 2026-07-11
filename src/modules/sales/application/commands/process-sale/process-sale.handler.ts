import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, MoreThan } from 'typeorm';
import { ProcessSaleCommand } from './process-sale.command';
import { Sale } from '../../../domain/entities/sale.entity';
import { SaleItem } from '../../../domain/entities/sale-item.entity';
import { SalePayment } from '../../../domain/entities/sale-payment.entity';
import { ProductStock } from '../../../../products/domain/entities/product-stock.entity';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';
import { ProductBatch } from '../../../../products/domain/entities/product-batch.entity';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { Customer } from '../../../../customers/domain/entities/customer.entity';

@CommandHandler(ProcessSaleCommand)
export class ProcessSaleHandler implements ICommandHandler<ProcessSaleCommand> {
  private readonly logger = new Logger(ProcessSaleHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(command: ProcessSaleCommand): Promise<Sale> {
    const { tenantId, branchId, cashSessionId, customerId, items, payments } = command;
    this.logger.log(`Processing sale for Tenant: ${tenantId}, Branch: ${branchId}, Cash Session: ${cashSessionId}`);
    return this.entityManager.transaction(async (transactionalManager) => {
      // 1. Grouped Repository Initialization (Pattern 3)
      const cashSessionRepo = transactionalManager.getRepository(CashSession);
      const customerRepo = transactionalManager.getRepository(Customer);
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const stockRepo = transactionalManager.getRepository(ProductStock);
      const saleRepo = transactionalManager.getRepository(Sale);
      const inventoryRepo = transactionalManager.getRepository(InventoryMovement);
      const batchRepo = transactionalManager.getRepository(ProductBatch);

      // 2. Verify Cash Session exists, matches branch and tenant, and is open
      const cashSession = await cashSessionRepo.findOne({
        where: {
          id: cashSessionId,
          status: 'OPEN',
          branch: { id: branchId, tenantId },
        },
        relations: { branch: true },
      });
      if (!cashSession) {
        this.logger.warn(`Sale failed: active cash session ${cashSessionId} not found or closed for branch ${branchId} under tenant ${tenantId}`);
        throw new BadRequestException('Active cash session not found for this branch');
      }

      // 3. Validate Customer belongs to Tenant if provided
      if (customerId) {
        const customerExists = await customerRepo.findOne({
          where: { id: customerId, tenantId },
        });
        if (!customerExists) {
          this.logger.warn(`Sale failed: Customer ID ${customerId} not found for Tenant ${tenantId}`);
          throw new NotFoundException(`Customer with ID ${customerId} not found`);
        }
      }

      let subtotal = 0;
      const saleItemsToSave: SaleItem[] = [];
      const inventoryMovements: InventoryMovement[] = [];

      // 4. Process items, verify/discount stock, compile costs
      for (const itemDto of items) {
        const variant = await variantRepo.findOne({
          where: {
            id: itemDto.variantId,
            product: { tenantId },
          },
          relations: { product: true },
        });
        if (!variant) {
          this.logger.warn(`Sale failed: Product Variant ID ${itemDto.variantId} not found for Tenant ${tenantId}`);
          throw new NotFoundException(`Product Variant with ID ${itemDto.variantId} not found`);
        }

        const stock = await stockRepo.findOne({
          where: {
            branchId: branchId,
            variantId: itemDto.variantId,
            branch: { tenantId },
          },
          relations: { branch: true },
          lock: { mode: 'pessimistic_write' },
        });

        if (!stock || Number(stock.quantity) < itemDto.quantity) {
          const available = stock ? stock.quantity : 0;
          this.logger.warn(`Sale failed: Insufficient stock for variant ${variant.sku}. Available: ${available}, Required: ${itemDto.quantity}`);
          throw new BadRequestException(
            `Insufficient stock for variant ${variant.sku}. Available: ${available}, Required: ${itemDto.quantity}`,
          );
        }

        // Subtract stock
        stock.quantity = Number(stock.quantity) - itemDto.quantity;
        await stockRepo.save(stock);

        // FIFO Batch consumption
        let remainingToConsume = itemDto.quantity;
        let totalCost = 0;

        const activeBatches = await batchRepo.find({
          where: {
            branchId: branchId,
            variantId: itemDto.variantId,
            remainingQuantity: MoreThan(0),
          },
          order: { createdAt: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });

        for (const batch of activeBatches) {
          const toConsume = Math.min(remainingToConsume, Number(batch.remainingQuantity));
          batch.remainingQuantity = Number(batch.remainingQuantity) - toConsume;
          await batchRepo.save(batch);

          totalCost += toConsume * Number(batch.unitCost);
          remainingToConsume -= toConsume;

          if (remainingToConsume === 0) break;
        }

        // Fallback in case of mismatch/empty batches
        if (remainingToConsume > 0) {
          totalCost += remainingToConsume * Number(variant.purchasePrice);
        }

        const averageUnitCost = Number((totalCost / itemDto.quantity).toFixed(2));

        // Build Sale Item
        const saleItem = new SaleItem();
        saleItem.variantId = itemDto.variantId;
        saleItem.quantity = itemDto.quantity;
        saleItem.price = itemDto.price;
        saleItem.cost = averageUnitCost;
        saleItemsToSave.push(saleItem);

        subtotal += itemDto.price * itemDto.quantity;

        // Build inventory movement (Kardex)
        const movement = new InventoryMovement();
        movement.tenantId = tenantId;
        movement.originBranchId = branchId;
        movement.destinationBranchId = null;
        movement.variantId = itemDto.variantId;
        movement.quantity = itemDto.quantity;
        movement.type = 'OUT';
        movement.reason = 'VENTA';
        inventoryMovements.push(movement);
      }

      const total = subtotal;

      // 5. Create and save Sale
      const sale = new Sale();
      sale.tenantId = tenantId;
      sale.branchId = branchId;
      sale.cashSessionId = cashSessionId;
      sale.customerId = customerId || null;
      sale.subtotal = subtotal;
      sale.total = total;
      sale.items = saleItemsToSave;

      // 6. Create Payments
      sale.payments = payments.map((p) => {
        const payment = new SalePayment();
        payment.paymentMethod = p.paymentMethod;
        payment.amount = p.amount;
        payment.referenceNumber = p.referenceNumber || null;
        return payment;
      });

      // Save Sale
      const savedSale = await saleRepo.save(sale);

      // Save inventory movements (Kardex)
      await inventoryRepo.save(inventoryMovements);

      this.logger.log(`Sale processed successfully: ID ${savedSale.id}, Total: ${savedSale.total}`);

      return savedSale;
    });
  }
}
