import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger, HttpStatus } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProcessSaleCommand, SalePaymentInput } from './process-sale.command';
import { Sale, SALE_CLIENT_REQUEST_INDEX } from '../../../domain/entities/sale.entity';
import { SaleItem } from '../../../domain/entities/sale-item.entity';
import { SalePayment } from '../../../domain/entities/sale-payment.entity';
import { ProductVariant } from '../../../../products/domain/entities/product-variant.entity';
import { InventoryMovement } from '../../../../products/domain/entities/inventory-movement.entity';
import { CashSession } from '../../../domain/entities/cash-session.entity';
import { CashSessionStatus } from '../../../domain/enums/cash-session-status.enum';
import { Customer } from '../../../../customers/domain/entities/customer.entity';
import { findOrCreateConsumerFinal } from '../../../../customers/domain/consumer-final';
import { InventoryMovementReason } from '../../../../../common/enums/inventory-movement-reason.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { consumeStock } from '../../../../products/application/services/inventory-stock';
import { allocatePayments, assertPaymentsCoverTotal, priceSale, SalePricing } from '../../../domain/services/sale-pricing';
import { lockCashSession } from '../shared/cash-session-lock';
import { assertUserAssignedToCashRegister } from '../shared/cash-register-access';
import { reserveInvoiceNumber } from '../shared/invoice-number';
import { SaleStatus } from '../../../../../common/enums/sale-status.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { isUniqueViolation } from '../../../../../common/errors/database-errors';
import { Money } from '../../../../../common/domain/money';

interface PricedSale {
  pricing: SalePricing;
  payments: SalePaymentInput[];
}

@CommandHandler(ProcessSaleCommand)
export class ProcessSaleHandler implements ICommandHandler<ProcessSaleCommand> {
  private readonly logger = new Logger(ProcessSaleHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: ProcessSaleCommand): Promise<Sale> {
    const { tenantId, branchId, cashSessionId } = command;
    this.logger.log(`Processing sale for Tenant: ${tenantId}, Branch: ${branchId}, Cash Session: ${cashSessionId}`);

    if (!cashSessionId) {
      throw new AppException(ErrorCode.CashSessionRequired, 'Debes tener una sesión de caja abierta para registrar una venta.', HttpStatus.BAD_REQUEST);
    }

    const priced = this.priceAndAllocate(command);

    // Reintento de una venta ya registrada: se devuelve la misma, sin descontar stock ni cobrar otra vez
    const replay = await this.findReplay(command, cashSessionId, priced);
    if (replay) return replay;

    try {
      return await this.entityManager.transaction((manager) => this.register(manager, command, cashSessionId, priced));
    } catch (error) {
      // Dos reintentos simultáneos con el mismo identificador: el segundo choca con el índice único y se revierte entero
      if (command.clientRequestId && isUniqueViolation(error, SALE_CLIENT_REQUEST_INDEX)) {
        const winner = await this.findReplay(command, cashSessionId, priced);
        if (winner) return winner;
      }
      throw error;
    }
  }

  /** La venta ya registrada con este `clientRequestId`, si existe. Reutilizarlo para otra venta distinta es un error. */
  private async findReplay(command: ProcessSaleCommand, cashSessionId: string, priced: PricedSale): Promise<Sale | null> {
    const { tenantId, branchId, userId, clientRequestId } = command;
    if (!clientRequestId) return null;

    const existing = await this.entityManager.getRepository(Sale).findOne({
      where: { tenantId, clientRequestId },
      relations: { items: { variant: true }, payments: true },
    });
    if (!existing) return null;

    const sameSale =
      existing.branchId === branchId &&
      existing.cashSessionId === cashSessionId &&
      (existing.userId ?? null) === (userId ?? null) &&
      Money.of(existing.total).toNumber() === priced.pricing.total;
    if (!sameSale) {
      this.logger.warn(`Sale rejected: clientRequestId already used by a different sale in Tenant ${tenantId}`);
      throw new AppException(ErrorCode.IdempotencyKeyReused, 'Ese identificador ya se usó en otra venta distinta.', HttpStatus.CONFLICT);
    }
    this.logger.log(`Sale replay: returning existing sale ${existing.id} for clientRequestId`);
    return existing;
  }

  /** Importes e invariantes monetarias (sin tocar la base de datos): falla rápido ante datos manipulados. */
  private priceAndAllocate(command: ProcessSaleCommand): PricedSale {
    try {
      const pricing = priceSale(command.items, command.discountAmount);
      assertPaymentsCoverTotal(pricing.total, command.payments.map((payment) => payment.amount));
      return { pricing, payments: allocatePayments(pricing.total, command.payments) };
    } catch (error) {
      this.logger.warn(`Sale rejected: invalid amounts for Tenant ${command.tenantId} (${error instanceof Error ? error.message : 'unknown'})`);
      throw error;
    }
  }

  private async register(manager: EntityManager, command: ProcessSaleCommand, cashSessionId: string, priced: PricedSale): Promise<Sale> {
    const { tenantId, userId, branchId, customerId } = command;

    // El usuario solo puede vender en sucursales que tiene asignadas
    await assertUserCanOperateInBranch(manager, this.redisService, { tenantId, userId, branchId, actionDescription: 'registrar ventas' });

    // Evita que el cierre de caja calcule el arqueo mientras esta venta está en curso
    await lockCashSession(manager, cashSessionId, 'share');

    const cashSession = await this.loadOpenSession(manager, command, cashSessionId);
    // Cualquier cajero asignado a la caja puede vender en su sesión abierta (no solo quien la abrió)
    await assertUserAssignedToCashRegister(manager, {
      tenantId,
      userId,
      cashRegisterId: cashSession.cashRegisterId,
      actionDescription: 'registrar ventas',
    });

    const invoiceNumber = await reserveInvoiceNumber(manager, { tenantId, branchId, cashSession });
    const buyerId = await this.resolveBuyerId(manager, tenantId, customerId);

    const { items, movements } = await this.sellItems(manager, command, priced.pricing);

    const sale = this.buildSale(command, cashSessionId, invoiceNumber, buyerId, priced, items);
    const savedSale = await manager.getRepository(Sale).save(sale);
    await manager.getRepository(InventoryMovement).save(movements); // kardex

    this.logger.log(`Sale processed successfully: ID ${savedSale.id}, Total: ${savedSale.total}`);
    return savedSale;
  }

  private async loadOpenSession(manager: EntityManager, command: ProcessSaleCommand, cashSessionId: string): Promise<CashSession> {
    const { tenantId, branchId } = command;
    const cashSession = await manager.getRepository(CashSession).findOne({
      where: { id: cashSessionId, status: CashSessionStatus.OPEN, branch: { id: branchId, tenantId } },
      relations: { branch: true },
    });
    if (!cashSession) {
      this.logger.warn(`Sale failed: active cash session ${cashSessionId} not found or closed for branch ${branchId} under tenant ${tenantId}`);
      throw new AppException(ErrorCode.NoOpenCashSession, 'No hay una sesión de caja abierta en esta sucursal.', HttpStatus.CONFLICT, { cashSessionId, branchId });
    }
    return cashSession;
  }

  /** El comprador de la venta: el indicado (debe ser de la tienda) o, si no se indica, el CONSUMIDOR FINAL de la tienda. */
  private async resolveBuyerId(manager: EntityManager, tenantId: string, customerId: string | undefined): Promise<string> {
    if (!customerId) {
      return (await findOrCreateConsumerFinal(manager, tenantId)).id;
    }
    const customer = await manager.getRepository(Customer).findOne({ where: { id: customerId, tenantId } });
    if (!customer) {
      this.logger.warn(`Sale failed: Customer ID ${customerId} not found for Tenant ${tenantId}`);
      throw new AppException(ErrorCode.CustomerNotFound, 'Cliente no encontrado.', HttpStatus.NOT_FOUND, { customerId });
    }
    return customer.id;
  }

  /**
   * Descuenta stock y lotes FIFO de cada línea y arma sus ítems y movimientos de kardex. Se recorren
   * ordenadas por variante: dos ventas con los mismos productos en distinto orden bloquearían las
   * filas de stock en orden cruzado (deadlock). Los ítems conservan el orden de la venta.
   */
  private async sellItems(manager: EntityManager, command: ProcessSaleCommand, pricing: SalePricing): Promise<{ items: SaleItem[]; movements: InventoryMovement[] }> {
    const { tenantId, branchId, items } = command;
    const saleItems = new Array<SaleItem>(items.length);
    const movements: InventoryMovement[] = [];

    const processingOrder = items.map((_, index) => index).sort((a, b) => items[a].variantId.localeCompare(items[b].variantId));
    for (const index of processingOrder) {
      const input = items[index];
      const variant = await manager.getRepository(ProductVariant).findOne({
        where: { id: input.variantId, product: { tenantId } },
        relations: { product: true },
      });
      if (!variant) {
        this.logger.warn(`Sale failed: Product Variant ID ${input.variantId} not found for Tenant ${tenantId}`);
        throw new AppException(ErrorCode.VariantNotFound, 'Variante no encontrada.', HttpStatus.NOT_FOUND, { variantId: input.variantId });
      }

      // Puede dejar el stock en negativo
      const { averageUnitCost } = await consumeStock(manager, {
        branchId,
        variantId: input.variantId,
        quantity: input.quantity,
        fallbackUnitCost: variant.purchasePrice,
      });

      const line = pricing.lines[index];
      const hasItemDiscount = line.discountAmount > 0;
      const item = new SaleItem();
      item.variantId = input.variantId;
      item.variant = variant;
      item.quantity = input.quantity;
      item.price = input.price;
      item.cost = averageUnitCost;
      item.discountType = hasItemDiscount ? (input.discountType || null) : null;
      item.discountRate = hasItemDiscount && input.discountRate !== undefined ? Number(input.discountRate) : null;
      item.discountAmount = line.discountAmount;
      item.subtotal = line.subtotal;
      item.globalDiscountAmount = line.globalDiscountAmount;
      item.total = line.total;
      saleItems[index] = item;

      const movement = new InventoryMovement();
      movement.tenantId = tenantId;
      movement.originBranchId = branchId;
      movement.destinationBranchId = null;
      movement.variantId = input.variantId;
      movement.quantity = input.quantity;
      movement.type = InventoryMovementType.OUT;
      movement.reason = InventoryMovementReason.VENTA;
      movements.push(movement);
    }
    return { items: saleItems, movements };
  }

  private buildSale(command: ProcessSaleCommand, cashSessionId: string, invoiceNumber: string, buyerId: string, priced: PricedSale, items: SaleItem[]): Sale {
    const { pricing, payments } = priced;
    const hasSaleDiscount = pricing.globalDiscountAmount > 0;

    const sale = new Sale();
    sale.tenantId = command.tenantId;
    sale.branchId = command.branchId;
    sale.cashSessionId = cashSessionId;
    sale.invoiceNumber = invoiceNumber;
    sale.customerId = buyerId;
    sale.clientRequestId = command.clientRequestId ?? null;
    sale.subtotal = pricing.subtotal;
    sale.total = pricing.total;
    sale.itemsDiscountAmount = pricing.itemsDiscountAmount;
    sale.globalDiscountAmount = pricing.globalDiscountAmount;
    sale.discountAmount = pricing.discountAmount;
    sale.discountType = hasSaleDiscount ? (command.discountType || null) : null;
    sale.discountRate = hasSaleDiscount && command.discountRate !== undefined ? Number(command.discountRate) : null;
    sale.status = SaleStatus.COMPLETED;
    sale.userId = command.userId || null;
    sale.items = items;
    sale.payments = payments.map((p) => {
      const payment = new SalePayment();
      payment.paymentMethod = p.paymentMethod;
      payment.amount = p.amount;
      payment.referenceNumber = p.referenceNumber || null;
      return payment;
    });
    return sale;
  }
}
