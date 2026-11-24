import { EntityManager } from 'typeorm';
import { RedisService } from '../../../src/common/redis/redis.service';
import { InventoryDocumentKind } from '../../../src/common/enums/inventory-document-kind.enum';
import { InventoryMovementType } from '../../../src/common/enums/inventory-movement-type.enum';
import { CreateInventoryDocumentCommand } from '../../../src/modules/products/application/commands/create-inventory-document/create-inventory-document.command';
import { InventoryDocumentResult } from '../../../src/modules/products/application/read-models/inventory-document';
import { createInventoryDocument } from '../../../src/modules/products/application/services/create-inventory-document';

interface StockAdjustment {
  tenantId: string;
  userId: string;
  branchId: string;
  variantId: string;
  quantity: number;
  type: InventoryMovementType;
}

/**
 * Atajo de los tests para dejar una variante con las existencias que necesitan: una entrada (`DONACION`) o una
 * salida (`MERMA`) de una sola línea, registradas con los casos de uso reales.
 */
export function adjustStock(manager: EntityManager, redis: RedisService, input: StockAdjustment): Promise<InventoryDocumentResult> {
  const { tenantId, userId, branchId, variantId, quantity, type } = input;
  const isEntry = type === InventoryMovementType.IN;
  return createInventoryDocument(
    manager,
    redis,
    new CreateInventoryDocumentCommand(tenantId, userId, branchId, isEntry ? InventoryDocumentKind.ENTRY : InventoryDocumentKind.EXIT, isEntry ? 'DONACION' : 'MERMA', [{ variantId, quantity }], 'Ajuste de prueba'),
  );
}
