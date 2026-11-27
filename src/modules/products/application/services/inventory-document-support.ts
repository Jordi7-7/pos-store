import { HttpStatus, Logger } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';
import { AppException } from '../../../../common/errors/app.exception';
import { isUniqueViolation } from '../../../../common/errors/database-errors';
import { ErrorCode } from '../../../../common/errors/error-codes';
import { INVENTORY_DOCUMENT_CLIENT_REQUEST_INDEX, InventoryDocument } from '../../domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';
import { ProductVariant } from '../../domain/entities/product-variant.entity';
import { MAX_DOCUMENT_LINES, MIN_COMMENT_LENGTH, hasValidComment, isCommentRequired } from '../../domain/services/inventory-document-rules';
import { InventoryDocumentResult } from '../read-models/inventory-document';
import { toDocumentResult } from './inventory-document';

/** El motivo no corresponde al tipo de documento. `target` completa la frase: «este tipo de movimiento», «un conteo»… */
export function invalidReason(kind: InventoryDocumentKind, reason: string, target: string): AppException {
  return new AppException(ErrorCode.InvalidMovementReason, `El motivo ${reason} no es válido para ${target}.`, HttpStatus.BAD_REQUEST, { reason, kind });
}

/** Las salidas manuales y los `OTRO` deben explicar qué pasó: sin comentario (o con uno de relleno) no se registran. */
export function assertCommentProvided(kind: InventoryDocumentKind, reason: string, comment: string | undefined): void {
  if (isCommentRequired(kind, reason) && !hasValidComment(comment)) {
    throw new AppException(
      ErrorCode.CommentRequired,
      `Escribe un comentario que explique el movimiento (mínimo ${MIN_COMMENT_LENGTH} caracteres).`,
      HttpStatus.BAD_REQUEST,
      { min: MIN_COMMENT_LENGTH, reason },
    );
  }
}

/** Un documento necesita al menos una línea y no más de las que una transacción puede bloquear. `noun`: «movimiento», «conteo», «traslado». */
export function assertLineCount(count: number, noun: string): void {
  if (count === 0) {
    throw new AppException(ErrorCode.EmptyInventoryDocument, `El ${noun} debe tener al menos un producto.`, HttpStatus.BAD_REQUEST);
  }
  if (count > MAX_DOCUMENT_LINES) {
    throw new AppException(ErrorCode.InventoryDocumentTooLarge, `Un movimiento admite hasta ${MAX_DOCUMENT_LINES} productos.`, HttpStatus.BAD_REQUEST, { max: MAX_DOCUMENT_LINES, received: count });
  }
}

/** Las variantes pedidas por id, todas de la tienda; si falta alguna (o es de otra tienda) no se sigue. */
export async function findVariantsOrFail(manager: EntityManager, tenantId: string, variantIds: readonly string[]): Promise<Map<string, ProductVariant>> {
  const ids = [...new Set(variantIds)];
  const variants = await manager.getRepository(ProductVariant).find({ where: { id: In(ids), product: { tenantId } } });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new AppException(ErrorCode.VariantNotFound, 'Una o más variantes no existen.', HttpStatus.NOT_FOUND, { variantIds: missing });
  }
  return byId;
}

/** Las líneas de un documento recién registrado, con el SKU de cada variante. */
export function toResultLines(movements: readonly InventoryMovement[], variants: ReadonlyMap<string, ProductVariant>): InventoryDocumentResult['lines'] {
  return movements.map((movement) => ({ variantId: movement.variantId, sku: variants.get(movement.variantId)!.sku, quantity: movement.quantity, type: movement.type }));
}

interface ReplayLookup {
  tenantId: string;
  clientRequestId: string | undefined;
  /** Solo las líneas de este sentido (el traslado devuelve únicamente las salidas del origen). */
  movementType?: InventoryMovementType;
  /** ¿El documento ya registrado es la misma operación que se pide ahora? */
  matches: (document: InventoryDocument, movements: readonly InventoryMovement[]) => boolean;
}

/** El documento ya registrado con ese `clientRequestId`, si existe. Reutilizarlo para otra operación distinta es un error. */
export async function findDocumentReplay(manager: EntityManager, logger: Logger, lookup: ReplayLookup): Promise<InventoryDocumentResult | null> {
  const { tenantId, clientRequestId, movementType, matches } = lookup;
  if (!clientRequestId) return null;

  const existing = await manager.getRepository(InventoryDocument).findOne({ where: { tenantId, clientRequestId } });
  if (!existing) return null;

  const movements = await manager.getRepository(InventoryMovement).find({ where: { documentId: existing.id, ...(movementType ? { type: movementType } : {}) }, relations: { variant: true } });
  if (!matches(existing, movements)) {
    logger.warn(`Inventory document rejected: clientRequestId already used by a different document in Tenant ${tenantId}`);
    throw new AppException(ErrorCode.IdempotencyKeyReused, 'Ese identificador ya se usó en otro movimiento distinto.', HttpStatus.CONFLICT);
  }
  logger.log(`Inventory document replay: returning ${existing.number} for clientRequestId`);
  return toDocumentResult(existing, movements.map((m) => ({ variantId: m.variantId, sku: m.variant.sku, quantity: m.quantity, type: m.type })));
}

/**
 * Registra una operación con `clientRequestId` sin duplicarla: si ya existe se devuelve esa; si dos reintentos
 * simultáneos compiten, el segundo choca con el índice único, se revierte entero y devuelve el ganador.
 */
export async function runOnce(
  clientRequestId: string | undefined,
  findReplay: () => Promise<InventoryDocumentResult | null>,
  register: () => Promise<InventoryDocumentResult>,
): Promise<InventoryDocumentResult> {
  const replay = await findReplay();
  if (replay) return replay;

  try {
    return await register();
  } catch (error) {
    if (clientRequestId && isUniqueViolation(error, INVENTORY_DOCUMENT_CLIENT_REQUEST_INDEX)) {
      const winner = await findReplay();
      if (winner) return winner;
    }
    throw error;
  }
}
