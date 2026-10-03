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
import { CashRegister } from '../../../domain/entities/cash-register.entity';
import { Customer } from '../../../../customers/domain/entities/customer.entity';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';

@CommandHandler(ProcessSaleCommand)
export class ProcessSaleHandler implements ICommandHandler<ProcessSaleCommand> {
  private readonly logger = new Logger(ProcessSaleHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

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
        const itemDiscountAmount = itemDto.discountAmount !== undefined ? Number(itemDto.discountAmount) : 0;
        const hasItemDiscount = itemDiscountAmount > 0;

        const saleItem = new SaleItem();
        saleItem.variantId = itemDto.variantId;
        saleItem.quantity = itemDto.quantity;
        saleItem.price = itemDto.price;
        saleItem.cost = averageUnitCost;
        saleItem.discountType = hasItemDiscount ? (itemDto.discountType || null) : null;
        saleItem.discountRate = hasItemDiscount && itemDto.discountRate !== undefined ? Number(itemDto.discountRate) : null;
        saleItem.discountAmount = itemDiscountAmount;
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

      // Totales agregados:
      // grossSubtotal: Suma de precios de lista (quantity * price)
      // totalItemsDiscount: Suma de descuentos propios de los productos
      // netBaseAfterItemsDiscount: Base imponible sobre la cual se aplica el descuento global
      const grossSubtotal = saleItemsToSave.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const totalItemsDiscount = saleItemsToSave.reduce((sum, item) => sum + item.discountAmount, 0);
      const netBaseAfterItemsDiscount = Number((grossSubtotal - totalItemsDiscount).toFixed(2));

      const totalGlobalDiscountAmount = discountAmount !== undefined ? Number(discountAmount) : 0;
      const hasSaleDiscount = totalGlobalDiscountAmount > 0;
      const total = Number((netBaseAfterItemsDiscount - totalGlobalDiscountAmount).toFixed(2));
      const overallDiscountAmount = Number((totalItemsDiscount + totalGlobalDiscountAmount).toFixed(2));

      // 4.1 Validar que los métodos de pago cubran el total de la venta
      const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const roundedTotalPaid = Math.round(totalPaid * 100) / 100;
      const roundedTotal = Math.round(total * 100) / 100;

      if (roundedTotalPaid < roundedTotal) {
        this.logger.warn(
          `Sale failed: Paid amount ($${roundedTotalPaid}) is less than sale total ($${roundedTotal}) for Tenant ${tenantId}`,
        );
        throw new BadRequestException(
          `El monto pagado ($${roundedTotalPaid.toFixed(2)}) es menor al total de la venta ($${roundedTotal.toFixed(2)}).`,
        );
      }

      // 4.2 Prorratear descuento global en cada ítem y calcular subtotal bruto y total neto
      if (hasSaleDiscount && netBaseAfterItemsDiscount > 0) {
        let accumulatedProrated = 0;
        saleItemsToSave.forEach((item, index) => {
          const rawSubtotal = Number((item.price * item.quantity).toFixed(2));
          item.subtotal = rawSubtotal;

          const itemBase = rawSubtotal - item.discountAmount;
          if (index === saleItemsToSave.length - 1) {
            // El último ítem absorbe el ajuste de centavos por redondeo
            const remainingProrated = Number((totalGlobalDiscountAmount - accumulatedProrated).toFixed(2));
            item.globalDiscountAmount = Math.max(0, remainingProrated);
          } else {
            const ratio = itemBase / netBaseAfterItemsDiscount;
            const prorated = Number((totalGlobalDiscountAmount * ratio).toFixed(2));
            item.globalDiscountAmount = prorated;
            accumulatedProrated += prorated;
          }
          item.total = Number((itemBase - item.globalDiscountAmount).toFixed(2));
        });
      } else {
        saleItemsToSave.forEach((item) => {
          const rawSubtotal = Number((item.price * item.quantity).toFixed(2));
          item.subtotal = rawSubtotal;
          item.globalDiscountAmount = 0;
          item.total = Number((rawSubtotal - item.discountAmount).toFixed(2));
        });
      }

      // 5. Create and save Sale
      const sale = new Sale();
      sale.tenantId = tenantId;
      sale.branchId = branchId;
      sale.cashSessionId = cashSessionId;
      sale.invoiceNumber = invoiceNumber;
      sale.customerId = customerId || null;
      sale.subtotal = Number(grossSubtotal.toFixed(2));
      sale.total = total;
      sale.itemsDiscountAmount = Number(totalItemsDiscount.toFixed(2));
      sale.globalDiscountAmount = totalGlobalDiscountAmount;
      sale.discountAmount = overallDiscountAmount;
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
