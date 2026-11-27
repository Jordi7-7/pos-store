import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../../common/security/branch-access.helper';
import { InventoryDocumentKind } from '../../../../../common/enums/inventory-document-kind.enum';
import { InventoryMovementCategory } from '../../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementType } from '../../../../../common/enums/inventory-movement-type.enum';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';
import { BatchOriginType } from '../../../../batches/domain/entities/batch.entity';
import { InventoryDocument } from '../../../domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../../domain/entities/inventory-movement.entity';
import { ProductVariant } from '../../../domain/entities/product-variant.entity';
import { DocumentLine, isManualReason, mergeDocumentLines, sameTotals, totalsByVariant } from '../../../domain/services/inventory-document-rules';
import { InventoryDocumentResult } from '../../read-models/inventory-document';
import { buildMovement, saveDocumentBatch, saveInventoryDocument, toDocumentResult } from '../../services/inventory-document';
import { assertLineCount, findDocumentReplay, findVariantsOrFail, invalidReason, runOnce, toResultLines } from '../../services/inventory-document-support';
import { findBranchOrFail } from '../../../../branches/application/services/branch-lookup';
import { consumeStock, lockBranchStock, receiveStock } from '../../services/inventory-stock';
import { CreateStockTransferCommand } from './create-stock-transfer.command';

/**
 * Traslado entre sucursales, instantáneo y todo o nada: lo que sale del origen entra al destino en la misma
 * transacción. El lote del destino conserva el costo con el que salió del origen (promedio de las capas FIFO
 * consumidas), así el traslado no crea ni destruye valor. En el kardex son dos movimientos por línea (salida del
 * origen y entrada al destino), ligados al mismo documento.
 */
@CommandHandler(CreateStockTransferCommand)
export class CreateStockTransferHandler implements ICommandHandler<CreateStockTransferCommand> {
  private readonly logger = new Logger(CreateStockTransferHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(command: CreateStockTransferCommand): Promise<InventoryDocumentResult> {
    const lines = this.validate(command);
    return await runOnce(
      command.clientRequestId,
      () => this.findReplay(command, lines),
      () => this.entityManager.transaction((manager) => this.register(manager, command, lines)),
    );
  }

  private validate(command: CreateStockTransferCommand): DocumentLine[] {
    if (!isManualReason(InventoryDocumentKind.TRANSFER, command.reason)) {
      throw invalidReason(InventoryDocumentKind.TRANSFER, command.reason, 'un traslado');
    }
    if (command.originBranchId === command.destinationBranchId) {
      throw new AppException(ErrorCode.SameBranchTransfer, 'El origen y el destino del traslado deben ser sucursales distintas.', HttpStatus.BAD_REQUEST, { branchId: command.originBranchId });
    }
    assertLineCount(command.lines.length, 'traslado');
    const invalid = command.lines.find((line) => !(line.quantity > 0));
    if (invalid) {
      throw new AppException(ErrorCode.InvalidQuantity, 'La cantidad debe ser mayor a 0.', HttpStatus.BAD_REQUEST, { variantId: invalid.variantId });
    }
    return mergeDocumentLines(command.lines.map(({ variantId, quantity }) => ({ variantId, quantity })));
  }

  private async register(manager: EntityManager, command: CreateStockTransferCommand, lines: DocumentLine[]): Promise<InventoryDocumentResult> {
    const { tenantId, userId, originBranchId, destinationBranchId } = command;
    // Hacen falta las dos sucursales: quien puede sacar de una pero no entrar a la otra no puede trasladar
    await assertUserCanOperateInBranch(manager, this.redisService, { tenantId, userId, branchId: originBranchId, actionDescription: 'trasladar mercancía desde esta sucursal' });
    await assertUserCanOperateInBranch(manager, this.redisService, { tenantId, userId, branchId: destinationBranchId, actionDescription: 'trasladar mercancía hacia esta sucursal' });

    const origin = await findBranchOrFail(manager, tenantId, originBranchId);
    await findBranchOrFail(manager, tenantId, destinationBranchId);
    const variants = await findVariantsOrFail(manager, tenantId, lines.map((line) => line.variantId));

    // Si un reintento simultáneo ya registró este traslado, el índice único del `clientRequestId` falla aquí y `runOnce` devuelve el ganador
    const document = await saveInventoryDocument(manager, { tenantId, branchId: originBranchId, destinationBranchId, userId, kind: InventoryDocumentKind.TRANSFER, reason: command.reason, comment: command.comment, clientRequestId: command.clientRequestId });

    const available = await this.lockRows(manager, originBranchId, destinationBranchId, lines);
    this.assertStock(lines, available, variants, originBranchId, origin.name);

    const movements = await this.move(manager, command, document, lines, variants);
    await manager.getRepository(InventoryMovement).save(movements);
    this.logger.log(`Stock transfer ${document.number} (${command.reason}) registered: ${lines.length} lines from Branch ${originBranchId} to Branch ${destinationBranchId}`);

    return toDocumentResult(document, toResultLines(movements.filter((m) => m.type === InventoryMovementType.OUT), variants));
  }

  /**
   * Bloquea las filas de stock de las dos sucursales en un orden global fijo (sucursal y luego variante). Hoy el contador
   * del número de documento ya hace esperar a los traslados de una tienda uno detrás de otro, así que no compiten por filas;
   * el orden se conserva para que dos traslados opuestos (A→B y B→A) sigan sin poder bloquearse si esa numeración cambia.
   * Devuelve lo que hay en el origen de cada variante.
   */
  private async lockRows(manager: EntityManager, originBranchId: string, destinationBranchId: string, lines: DocumentLine[]): Promise<Map<string, number>> {
    const rows = [originBranchId, destinationBranchId].flatMap((branchId) => lines.map((line) => ({ branchId, variantId: line.variantId })));
    rows.sort((a, b) => a.branchId.localeCompare(b.branchId) || a.variantId.localeCompare(b.variantId));
    const atOrigin = new Map<string, number>();
    for (const { branchId, variantId } of rows) {
      const stock = await lockBranchStock(manager, branchId, variantId);
      if (branchId === originBranchId) atOrigin.set(variantId, stock.quantity);
    }
    return atOrigin;
  }

  private assertStock(lines: DocumentLine[], available: ReadonlyMap<string, number>, variants: Map<string, ProductVariant>, branchId: string, branchName: string): void {
    const shortages = lines
      .filter((line) => (available.get(line.variantId) ?? 0) < line.quantity)
      .map((line) => ({ variantId: line.variantId, sku: variants.get(line.variantId)!.sku, available: available.get(line.variantId) ?? 0, requested: line.quantity }));
    if (shortages.length === 0) return;

    this.logger.warn(`Stock transfer rejected: insufficient stock on Branch ${branchId} for ${shortages.length} line(s)`);
    const first = shortages[0];
    throw new AppException(
      ErrorCode.InsufficientStock,
      `Stock insuficiente en la sucursal ${branchName}. ${first.sku}: hay ${first.available}, se piden ${first.requested}.`,
      HttpStatus.CONFLICT,
      { branchId, variantId: first.variantId, available: first.available, requested: first.requested, lines: shortages },
    );
  }

  /** Cada línea sale del origen por FIFO y entra al destino como una capa con el costo con el que salió. */
  private async move(manager: EntityManager, command: CreateStockTransferCommand, document: InventoryDocument, lines: DocumentLine[], variants: Map<string, ProductVariant>): Promise<InventoryMovement[]> {
    const { tenantId, originBranchId, destinationBranchId, reason } = command;
    const batchId = await saveDocumentBatch(manager, document, destinationBranchId, BatchOriginType.TRANSFER);

    const movements: InventoryMovement[] = [];
    for (const { variantId, quantity } of lines) {
      const { averageUnitCost, newStock: originBalance } = await consumeStock(manager, { branchId: originBranchId, variantId, quantity, fallbackUnitCost: variants.get(variantId)!.purchasePrice });
      const destinationBalance = await receiveStock(manager, { tenantId, branchId: destinationBranchId, variantId, batchId, quantity, unitCost: averageUnitCost });
      const category = InventoryMovementCategory.TRANSFER;
      movements.push(
        buildMovement({ document, variantId, quantity, type: InventoryMovementType.OUT, category, reason, branchId: originBranchId, unitCost: averageUnitCost, balanceAfter: originBalance }),
        buildMovement({ document, variantId, quantity, type: InventoryMovementType.IN, category, reason, branchId: destinationBranchId, unitCost: averageUnitCost, balanceAfter: destinationBalance }),
      );
    }
    return movements;
  }

  private findReplay(command: CreateStockTransferCommand, lines: readonly DocumentLine[]): Promise<InventoryDocumentResult | null> {
    const requested = totalsByVariant(lines);
    return findDocumentReplay(this.entityManager, this.logger, {
      tenantId: command.tenantId,
      clientRequestId: command.clientRequestId,
      movementType: InventoryMovementType.OUT,
      matches: (existing, movements) =>
        existing.kind === InventoryDocumentKind.TRANSFER &&
        existing.branchId === command.originBranchId &&
        existing.destinationBranchId === command.destinationBranchId &&
        existing.reason === command.reason &&
        existing.userId === command.userId &&
        sameTotals(totalsByVariant(movements), requested),
    });
  }
}
