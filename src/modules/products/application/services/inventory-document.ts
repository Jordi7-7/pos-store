import { EntityManager } from 'typeorm';
import { InventoryDocumentKind } from '../../../../common/enums/inventory-document-kind.enum';
import { InventoryMovementCategory } from '../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';
import { Batch, BatchOriginType } from '../../../batches/domain/entities/batch.entity';
import { InventoryDocument } from '../../domain/entities/inventory-document.entity';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';
import { DOCUMENT_PREFIX, formatDocumentNumber } from '../../domain/services/inventory-document-rules';
import { InventoryDocumentResult } from '../read-models/inventory-document';
import { newKardexLine } from './kardex';

export interface NewInventoryDocument {
  tenantId: string;
  branchId: string;
  userId: string | null;
  /** Solo en traslados. */
  destinationBranchId?: string;
  kind: InventoryDocumentKind;
  reason: string;
  comment?: string;
  clientRequestId?: string;
}

/** Guarda la cabecera con el siguiente número de su serie: un solo UPSERT atómico, así dos documentos simultáneos nunca comparten número. */
export async function saveInventoryDocument(manager: EntityManager, input: NewInventoryDocument): Promise<InventoryDocument> {
  const prefix = DOCUMENT_PREFIX[input.kind];
  const rows: Array<{ last_number: number }> = await manager.query(
    `INSERT INTO "inventory_document_counters" ("tenant_id", "prefix", "last_number") VALUES ($1, $2, 1)
     ON CONFLICT ("tenant_id", "prefix") DO UPDATE SET "last_number" = "inventory_document_counters"."last_number" + 1
     RETURNING "last_number"`,
    [input.tenantId, prefix],
  );

  const document = new InventoryDocument();
  document.tenantId = input.tenantId;
  document.branchId = input.branchId;
  document.userId = input.userId;
  document.destinationBranchId = input.destinationBranchId ?? null;
  document.kind = input.kind;
  document.number = formatDocumentNumber(prefix, Number(rows[0].last_number));
  document.reason = input.reason;
  document.comment = input.comment?.trim() || null;
  document.clientRequestId = input.clientRequestId ?? null;
  return manager.getRepository(InventoryDocument).save(document);
}

export function toDocumentResult(document: InventoryDocument, lines: InventoryDocumentResult['lines']): InventoryDocumentResult {
  return {
    id: document.id,
    number: document.number,
    kind: document.kind,
    reason: document.reason,
    comment: document.comment,
    branchId: document.branchId,
    destinationBranchId: document.destinationBranchId,
    createdAt: document.createdAt,
    lines,
  };
}

/** El lote que agrupa lo que entra por un documento (con el número del documento como código). Devuelve su id. */
export async function saveDocumentBatch(manager: EntityManager, document: InventoryDocument, branchId: string, originType: BatchOriginType): Promise<string> {
  const header = new Batch();
  header.tenantId = document.tenantId;
  header.branchId = branchId;
  header.purchaseOrderId = null;
  header.documentId = document.id;
  header.code = document.number;
  header.originType = originType;
  header.notes = document.comment;
  return (await manager.getRepository(Batch).save(header)).id;
}

interface NewMovement {
  document: InventoryDocument;
  variantId: string;
  quantity: number;
  type: InventoryMovementType;
  category: InventoryMovementCategory;
  reason: string;
  /** La sucursal donde se movió el stock: de la que sale (`OUT`) o a la que entra (`IN`). */
  branchId: string;
  unitCost: number;
  balanceAfter: number;
}

/** Una línea del kardex ligada al documento. */
export function buildMovement({ document, ...line }: NewMovement): InventoryMovement {
  return newKardexLine({ tenantId: document.tenantId, documentId: document.id, ...line });
}
