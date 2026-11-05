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
import { CashSessionStatus } from '../../../domain/enums/cash-session-status.enum';
import { CashRegister } from '../../../domain/entities/cash-register.entity';
import { Customer } from '../../../../customers/domain/entities/customer.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { assertPaymentsCoverTotal, priceSale, SalePricing } from '../../../domain/services/sale-pricing';
import { lockCashSession } from '../shared/cash-session-lock';
import { assertUserAssignedToCashRegister } from '../shared/cash-register-access';

@CommandHandler(ProcessSaleCommand)
export class ProcessSaleHandler implements ICommandHandler<ProcessSaleCommand> {
  private readonly logger = new Logger(ProcessSaleHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: ProcessSaleCommand): Promise<Sale> {
    const { 
      tenantId,
      userId,
      branchId, 
      cashSessionId, 
      customerId, 
      items, 
      payments, 
      discountType, 
      discountRate, 
      discountAmount 
    } = command;
    this.logger.log(`Processing sale for Tenant: ${tenantId}, Branch: ${branchId}, Cash Session: ${cashSessionId}`);

    if (!cashSessionId) {
      throw new BadRequestException('Debes tener una sesión de caja abierta para registrar una venta.');
    }

    // Importes e invariantes monetarias (sin tocar la base de datos): falla rápido ante datos manipulados
    let pricing: SalePricing;
    try {
      pricing = priceSale(items, discountAmount);
      assertPaymentsCoverTotal(pricing.total, payments.map((payment) => payment.amount));
    } catch (error) {
      this.logger.warn(`Sale rejected: invalid amounts for Tenant ${tenantId} (${error instanceof Error ? error.message : 'unknown'})`);
      throw error;
    }

    return this.entityManager.transaction(async (transactionalManager) => {
      // El usuario solo puede vender en sucursales que tiene asignadas
      await assertUserCanOperateInBranch(transactionalManager, this.redisService, {
        tenantId,
        userId,
        branchId,
        actionDescription: 'registrar ventas',
      });

      // 1. Grouped Repository Initialization (Pattern 3)
      const cashSessionRepo = transactionalManager.getRepository(CashSession);
      const customerRepo = transactionalManager.getRepository(Customer);
      const variantRepo = transactionalManager.getRepository(ProductVariant);
      const stockRepo = transactionalManager.getRepository(ProductStock);
      const saleRepo = transactionalManager.getRepository(Sale);
      const inventoryRepo = transactionalManager.getRepository(InventoryMovement);
      const batchRepo = transactionalManager.getRepository(ProductBatch);

      // Evita que el cierre de caja calcule el arqueo mientras esta venta está en curso
      await lockCashSession(transactionalManager, cashSessionId, 'share');

      // 2. Verify Cash Session exists, matches branch and tenant, and is open
      const cashSession = await cashSessionRepo.findOne({
        where: {
          id: cashSessionId,
          status: CashSessionStatus.OPEN,
          branch: { id: branchId, tenantId },
        },
        relations: { branch: true },
      });
      if (!cashSession) {
        this.logger.warn(`Sale failed: active cash session ${cashSessionId} not found or closed for branch ${branchId} under tenant ${tenantId}`);
        throw new BadRequestException('Active cash session not found for this branch');
      }

      // Cualquier cajero asignado a la caja puede vender en su sesión abierta (no solo quien la abrió)
      await assertUserAssignedToCashRegister(transactionalManager, {
        tenantId,
        userId,
        cashRegisterId: cashSession.cashRegisterId,
        actionDescription: 'registrar ventas',
      });

      // Lock cash register and generate invoice number
      const registerRepo = transactionalManager.getRepository(CashRegister);
      let registerId = cashSession.cashRegisterId;
      if (!registerId) {
        let reg = await registerRepo.findOne({
          where: { branchId, code: 1, tenantId }
        });
        if (!reg) {
          reg = new CashRegister();
          reg.tenantId = tenantId;
          reg.branchId = branchId;
          reg.code = 1;
          reg.name = 'Caja Principal 1';
          reg.nextInvoiceNumber = 1;
          reg = await registerRepo.save(reg);
        }
        registerId = reg.id;
      }

      const register = await registerRepo.findOne({
        where: { id: registerId },
        lock: { mode: 'pessimistic_write' }
      });
      if (!register) {
        throw new BadRequestException('Cash register not found');
      }

      const branchCode = String(cashSession.branch.code || 1).padStart(3, '0');
      const registerCode = String(register.code || 1).padStart(3, '0');
      const seqStr = String(register.nextInvoiceNumber).padStart(9, '0');
      const invoiceNumber = `${branchCode}-${registerCode}-${seqStr}`;

      // Increment sequential count
      register.nextInvoiceNumber += 1;
      await registerRepo.save(register);

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

      const saleItemsToSave: SaleItem[] = [];
      const inventoryMovements: InventoryMovement[] = [];

      // 4. Process items, verify/discount stock, compile costs
      for (const [index, itemDto] of items.entries()) {
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

        let stock = await stockRepo.findOne({
          where: {
            branchId: branchId,
            variantId: itemDto.variantId,
            branch: { tenantId },
          },
          relations: { branch: true },
          lock: { mode: 'pessimistic_write' },
        });

        if (!stock) {
          stock = new ProductStock();
          stock.branchId = branchId;
          stock.variantId = itemDto.variantId;
          stock.quantity = 0;
        }

        // Subtract stock (can become negative)
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
        const pricedLine = pricing.lines[index];
        const hasItemDiscount = pricedLine.discountAmount > 0;

        const saleItem = new SaleItem();
        saleItem.variantId = itemDto.variantId;
        saleItem.variant = variant;
        saleItem.quantity = itemDto.quantity;
        saleItem.price = itemDto.price;
        saleItem.cost = averageUnitCost;
        saleItem.discountType = hasItemDiscount ? (itemDto.discountType || null) : null;
        saleItem.discountRate = hasItemDiscount && itemDto.discountRate !== undefined ? Number(itemDto.discountRate) : null;
        saleItem.discountAmount = pricedLine.discountAmount;
        saleItem.subtotal = pricedLine.subtotal;
        saleItem.globalDiscountAmount = pricedLine.globalDiscountAmount;
        saleItem.total = pricedLine.total;
        saleItemsToSave.push(saleItem);

        // Build inventory movement (Kardex)
        const movement = new InventoryMovement();
        movement.tenantId = tenantId;
        movement.originBranchId = branchId;
        movement.destinationBranchId = null;
        movement.variantId = itemDto.variantId;
        movement.quantity = itemDto.quantity;
        movement.type = InventoryMovementType.OUT;
        movement.reason = InventoryMovementReason.VENTA;
        inventoryMovements.push(movement);
      }

      const hasSaleDiscount = pricing.globalDiscountAmount > 0;

      // 5. Create and save Sale
      const sale = new Sale();
      sale.tenantId = tenantId;
      sale.branchId = branchId;
      sale.cashSessionId = cashSessionId;
      sale.invoiceNumber = invoiceNumber;
      sale.customerId = customerId || null;
      sale.subtotal = pricing.subtotal;
      sale.total = pricing.total;
      sale.itemsDiscountAmount = pricing.itemsDiscountAmount;
      sale.globalDiscountAmount = pricing.globalDiscountAmount;
      sale.discountAmount = pricing.discountAmount;
      sale.discountType = hasSaleDiscount ? (discountType || null) : null;
      sale.discountRate = hasSaleDiscount && discountRate !== undefined ? Number(discountRate) : null;
      sale.status = 'COMPLETED';
      sale.userId = userId || null;
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
