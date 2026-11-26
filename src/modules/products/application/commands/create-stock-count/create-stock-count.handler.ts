import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { subtractQuantities } from '../../../../../common/domain/quantity';
import { InventoryDocumentKind } from '../../../../../common/enums/inventory-document-kind.enum';
import { InventoryMovementCategory } from '../../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { BatchOriginType } from '../../../../batches/domain/entities/batch.entity';
import { InventoryDocument } from '../../../domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { isManualReason, sameTotals, totalsByVariant } from '../../../domain/services/inventory-document-rules';
import { CountAdjustment, duplicatedVariants, planStockCount } from '../../../domain/services/stock-count-rules';
import { InventoryDocumentResult } from '../../read-models/inventory-document';
import { buildMovement, saveDocumentBatch, saveInventoryDocument, toDocumentResult } from '../../services/inventory-document';
import { assertLineCount, findDocumentReplay, findVariantsOrFail, invalidReason, runOnce, toResultLines } from '../../services/inventory-document-support';
import { findBranchOrFail } from '../../../../branches/application/services/branch-lookup';
import { consumeStock, lockBranchStock, receiveStock } from '../../services/inventory-stock';
import { CreateStockCountCommand } from './create-stock-count.command';

/**
 * Conteo físico: la diferencia (contado − lo que el usuario veía) se suma o resta al stock de ahora, así lo vendido
 * mientras se contaba no se pisa. Todo o nada. Si el stock cambió desde que el usuario lo vio, pide confirmación
 * (`STOCK_CHANGED_SINCE_COUNT`) en vez de aplicar a ciegas.
 */
@CommandHandler(CreateStockCountCommand)
export class CreateStockCountHandler implements ICommandHandler<CreateStockCountCommand> {
  private readonly logger = new Logger(CreateStockCountHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: CreateStockCountCommand): Promise<InventoryDocumentResult> {
    this.validate(command);
    return await runOnce(
      command.clientRequestId,
      () => this.findReplay(this.entityManager, command),
      () => this.entityManager.transaction((manager) => this.register(manager, command)),
    );
  }

  private validate(command: CreateStockCountCommand): void {
    if (!isManualReason(InventoryDocumentKind.COUNT, command.reason)) {
      throw invalidReason(InventoryDocumentKind.COUNT, command.reason, 'un conteo');
    }
    assertLineCount(command.lines.length, 'conteo');
    const invalid = command.lines.find((line) => !(line.counted >= 0) || !Number.isFinite(line.expected) || (line.unitCost !== undefined && !(line.unitCost >= 0)));
    if (invalid) {
      throw new AppException(ErrorCode.InvalidQuantity, 'La cantidad contada no puede ser negativa.', HttpStatus.BAD_REQUEST, { variantId: invalid.variantId });
    }
    const repeated = duplicatedVariants(command.lines);
    if (repeated.length > 0) {
      throw new AppException(ErrorCode.DuplicateCountLine, 'Un producto aparece más de una vez en el conteo.', HttpStatus.BAD_REQUEST, { variantIds: repeated });
    }
  }

  private async register(manager: EntityManager, command: CreateStockCountCommand): Promise<InventoryDocumentResult> {
    const { tenantId, userId, branchId } = command;
    await assertUserCanOperateInBranch(manager, this.redisService, { tenantId, userId, branchId, actionDescription: 'registrar conteos de inventario' });

    const branch = await findBranchOrFail(manager, tenantId, branchId);
    const variantIds = command.lines.map((line) => line.variantId);
    const variants = await findVariantsOrFail(manager, tenantId, variantIds);

    // Se bloquean todas las filas de stock en orden fijo antes de decidir nada, para que lo que se compara sea lo que se modifica
    const current = new Map<string, number>();
    for (const variantId of [...variantIds].sort()) current.set(variantId, (await lockBranchStock(manager, branchId, variantId)).quantity);

    // Un reintento simultáneo espera aquí a que el primero termine: si ya quedó registrado, se devuelve ese en vez de ver "el stock cambió"
    const replay = await this.findReplay(manager, command);
    if (replay) return replay;

    const plan = planStockCount(command.lines, current);
    if (plan.adjustments.length === 0) {
      throw new AppException(ErrorCode.CountWithoutDifferences, 'Lo contado coincide con el sistema: no hay nada que ajustar.', HttpStatus.BAD_REQUEST);
    }
    if (plan.negative.length > 0) {
      this.logger.warn(`Stock count rejected: ${plan.negative.length} line(s) would leave negative stock on Branch ${branchId}`);
      const lines = plan.negative.map((n) => ({ variantId: n.variantId, sku: variants.get(n.variantId)!.sku, available: n.current, requested: Math.abs(n.difference) }));
      const first = lines[0];
      throw new AppException(
        ErrorCode.InsufficientStock,
        `Stock insuficiente en la sucursal ${branch.name}. ${first.sku}: hay ${first.available}, el conteo resta ${first.requested}.`,
        HttpStatus.CONFLICT,
        { branchId, variantId: first.variantId, available: first.available, requested: first.requested, lines },
      );
    }
    if (plan.changed.length > 0 && !command.acceptStockChanges) {
      throw new AppException(
        ErrorCode.StockChangedSinceCount,
        'El stock cambió desde que se agregaron los productos al conteo. Revisa y confirma para aplicar la diferencia contada.',
        HttpStatus.CONFLICT,
        { branchId, lines: plan.changed.map((c) => ({ variantId: c.variantId, sku: variants.get(c.variantId)!.sku, expected: c.expected, current: c.current })) },
      );
    }

    const document = await saveInventoryDocument(manager, { tenantId, branchId, userId, kind: InventoryDocumentKind.COUNT, reason: command.reason, comment: command.comment, clientRequestId: command.clientRequestId });
    const movements = await this.apply(manager, command, document, plan.adjustments, variants);
    await manager.getRepository(InventoryMovement).save(movements);
    this.logger.log(`Stock count ${document.number} (${command.reason}) registered: ${movements.length} adjustment(s) on Branch ${branchId}`);

    return toDocumentResult(document, toResultLines(movements, variants));
  }

  /** Lo que sobra entra en un solo lote del documento; lo que falta sale por FIFO. */
  private async apply(manager: EntityManager, command: CreateStockCountCommand, document: InventoryDocument, adjustments: readonly CountAdjustment[], variants: Map<string, ProductVariant>): Promise<InventoryMovement[]> {
    const { tenantId, branchId } = command;
    const ordered = [...adjustments].sort((a, b) => a.variantId.localeCompare(b.variantId));
    let batchId: string | null = null;
    const movements: InventoryMovement[] = [];

    for (const { variantId, quantity, type, unitCost } of ordered) {
      const purchasePrice = variants.get(variantId)!.purchasePrice;
      let cost: number;
      let balanceAfter: number;
      if (type === 'IN') {
        batchId ??= await saveDocumentBatch(manager, document, branchId, BatchOriginType.ADJUSTMENT);
        cost = unitCost ?? purchasePrice ?? 0;
        balanceAfter = await receiveStock(manager, { tenantId, branchId, variantId, batchId, quantity, unitCost: cost });
      } else {
        const consumed = await consumeStock(manager, { branchId, variantId, quantity, fallbackUnitCost: purchasePrice });
        cost = consumed.averageUnitCost;
        balanceAfter = consumed.newStock;
      }
      movements.push(
        buildMovement({ document, variantId, quantity, type: type === 'IN' ? InventoryMovementType.IN : InventoryMovementType.OUT, category: InventoryMovementCategory.COUNT, reason: command.reason, branchId, unitCost: cost, balanceAfter }),
      );
    }
    return movements;
  }

  private findReplay(manager: EntityManager, command: CreateStockCountCommand): Promise<InventoryDocumentResult | null> {
    // Lo que el conteo cambió en cada variante, con signo: lo que sobra suma y lo que falta resta
    const requested = totalsByVariant(command.lines.map((line) => ({ variantId: line.variantId, quantity: subtractQuantities(line.counted, line.expected) })).filter((line) => line.quantity !== 0));
    return findDocumentReplay(manager, this.logger, {
      tenantId: command.tenantId,
      clientRequestId: command.clientRequestId,
      matches: (existing, movements) => {
        const applied = totalsByVariant(movements.map((m) => ({ variantId: m.variantId, quantity: m.type === InventoryMovementType.IN ? m.quantity : subtractQuantities(0, m.quantity) })));
        return existing.branchId === command.branchId && existing.kind === InventoryDocumentKind.COUNT && existing.reason === command.reason && existing.userId === command.userId && sameTotals(applied, requested);
      },
    });
  }
}
