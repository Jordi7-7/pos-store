import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RedisService } from '../../../../common/redis/redis.service';
import { assertUserCanOperateInBranch } from '../../../../common/security/branch-access.helper';
import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';
import { InventoryMovementCategory } from '../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';
import { AppException } from '../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { BatchOriginType } from '../../../batches/domain/entities/batch.entity';
import { InventoryDocument } from '../../domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';
import { ProductVariant } from '../../domain/entities/product-variant.entity';
import { DocumentLine, isManualReason, mergeDocumentLines, sameTotals, totalsByVariant } from '../../domain/services/inventory-document-rules';
import { CreateInventoryDocumentCommand } from '../commands/create-inventory-document/create-inventory-document.command';
import { InventoryDocumentResult } from '../read-models/inventory-document';
import { buildMovement, saveDocumentBatch, saveInventoryDocument, toDocumentResult } from './inventory-document';
import { assertCommentProvided, assertLineCount, findBranchOrFail, findDocumentReplay, findVariantsOrFail, invalidReason, runOnce, toResultLines } from './inventory-document-support';
import { consumeStock, lockBranchStock, receiveStock } from './inventory-stock';

const logger = new Logger('CreateInventoryDocument');

/**
 * Registra una entrada o salida manual con varias líneas: todo o nada. Si una sola línea no se puede
 * (stock insuficiente, variante ajena), no se guarda nada y el error dice cuáles fallaron.
 * Es un servicio y no solo el handler para poder reutilizarlo desde otros casos de uso sin pasar por el bus.
 */
export async function createInventoryDocument(entityManager: EntityManager, redisService: RedisService, command: CreateInventoryDocumentCommand): Promise<InventoryDocumentResult> {
  const lines = validate(command);
  return await runOnce(
    command.clientRequestId,
    () => findReplay(entityManager, command, lines),
    () => entityManager.transaction((manager) => register(manager, redisService, command, lines)),
  );
}

function validate(command: CreateInventoryDocumentCommand): DocumentLine[] {
  // el conteo y el traslado tienen sus propios casos de uso
  const isEntryOrExit = command.kind === InventoryDocumentKind.ENTRY || command.kind === InventoryDocumentKind.EXIT;
  if (!isEntryOrExit || !isManualReason(command.kind, command.reason)) {
    throw invalidReason(command.kind, command.reason, 'este tipo de movimiento');
  }
  assertCommentProvided(command.kind, command.reason, command.comment);
  assertLineCount(command.lines.length, 'movimiento');
  const invalid = command.lines.find((line) => !(line.quantity > 0) || (line.unitCost !== undefined && !(line.unitCost >= 0)));
  if (invalid) {
    throw new AppException(ErrorCode.InvalidQuantity, 'La cantidad debe ser mayor a 0.', HttpStatus.BAD_REQUEST, { variantId: invalid.variantId });
  }
  // El costo solo tiene sentido al entrar mercancía: en una salida se ignora
  const lines = command.kind === InventoryDocumentKind.EXIT ? command.lines.map(({ variantId, quantity }) => ({ variantId, quantity })) : command.lines;
  return mergeDocumentLines(lines);
}

async function register(manager: EntityManager, redisService: RedisService, command: CreateInventoryDocumentCommand, lines: DocumentLine[]): Promise<InventoryDocumentResult> {
  const { tenantId, userId, branchId, kind } = command;
  await assertUserCanOperateInBranch(manager, redisService, { tenantId, userId, branchId, actionDescription: 'registrar movimientos de inventario' });

  const branch = await findBranchOrFail(manager, tenantId, branchId);
  const variants = await findVariantsOrFail(manager, tenantId, lines.map((line) => line.variantId));

  // Si un reintento simultáneo ya registró este documento, el índice único del `clientRequestId` falla aquí y `runOnce` devuelve el ganador
  const document = await saveInventoryDocument(manager, { tenantId, branchId, userId, kind, reason: command.reason, comment: command.comment, clientRequestId: command.clientRequestId });
  const movements = kind === InventoryDocumentKind.EXIT ? await exitStock(manager, command, document, lines, variants, branch.name) : await enterStock(manager, command, document, lines, variants);

  await manager.getRepository(InventoryMovement).save(movements);
  logger.log(`Inventory document ${document.number} (${kind}, ${command.reason}) registered: ${lines.length} lines on Branch ${branchId}`);

  return toDocumentResult(document, toResultLines(movements, variants));
}

/** Bloquea todas las filas de stock (en orden fijo), comprueba que alcance para cada línea y recién entonces descuenta. */
async function exitStock(
  manager: EntityManager,
  command: CreateInventoryDocumentCommand,
  document: InventoryDocument,
  lines: DocumentLine[],
  variants: Map<string, ProductVariant>,
  branchName: string,
): Promise<InventoryMovement[]> {
  const { branchId } = command;
  const available: number[] = [];
  for (const line of lines) available.push((await lockBranchStock(manager, branchId, line.variantId)).quantity);

  const shortages = lines.flatMap((line, index) =>
    available[index] < line.quantity ? [{ variantId: line.variantId, sku: variants.get(line.variantId)!.sku, available: available[index], requested: line.quantity }] : [],
  );
  if (shortages.length > 0) {
    logger.warn(`Inventory document rejected: insufficient stock on Branch ${branchId} for ${shortages.length} line(s)`);
    const first = shortages[0];
    throw new AppException(
      ErrorCode.InsufficientStock,
      `Stock insuficiente en la sucursal ${branchName}. ${first.sku}: hay ${first.available}, se piden ${first.requested}.`,
      HttpStatus.CONFLICT,
      { branchId, variantId: first.variantId, available: first.available, requested: first.requested, lines: shortages },
    );
  }

  const movements: InventoryMovement[] = [];
  for (const line of lines) {
    const { averageUnitCost, newStock } = await consumeStock(manager, { branchId, variantId: line.variantId, quantity: line.quantity, fallbackUnitCost: variants.get(line.variantId)!.purchasePrice });
    movements.push(
      buildMovement({ document, variantId: line.variantId, quantity: line.quantity, type: InventoryMovementType.OUT, category: InventoryMovementCategory.ADJUSTMENT, reason: command.reason, branchId, unitCost: averageUnitCost, balanceAfter: newStock }),
    );
  }
  return movements;
}

/** Un solo lote por documento; cada línea entra como una capa FIFO con su costo (o el de compra de la variante). */
async function enterStock(manager: EntityManager, command: CreateInventoryDocumentCommand, document: InventoryDocument, lines: DocumentLine[], variants: Map<string, ProductVariant>): Promise<InventoryMovement[]> {
  const { tenantId, branchId } = command;
  const batchId = await saveDocumentBatch(manager, document, branchId, BatchOriginType.ADJUSTMENT);

  const movements: InventoryMovement[] = [];
  for (const line of lines) {
    const unitCost = line.unitCost ?? variants.get(line.variantId)!.purchasePrice ?? 0;
    const balanceAfter = await receiveStock(manager, { tenantId, branchId, variantId: line.variantId, batchId, quantity: line.quantity, unitCost });
    movements.push(
      buildMovement({ document, variantId: line.variantId, quantity: line.quantity, type: InventoryMovementType.IN, category: InventoryMovementCategory.ADJUSTMENT, reason: command.reason, branchId, unitCost, balanceAfter }),
    );
  }
  return movements;
}

function findReplay(entityManager: EntityManager, command: CreateInventoryDocumentCommand, lines: readonly DocumentLine[]): Promise<InventoryDocumentResult | null> {
  const requested = totalsByVariant(lines);
  return findDocumentReplay(entityManager, logger, {
    tenantId: command.tenantId,
    clientRequestId: command.clientRequestId,
    matches: (existing, movements) =>
      existing.branchId === command.branchId &&
      existing.kind === command.kind &&
      existing.reason === command.reason &&
      existing.userId === command.userId &&
      sameTotals(totalsByVariant(movements), requested),
  });
}
