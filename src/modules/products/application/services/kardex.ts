import { InventoryMovementCategory } from '../../../../common/enums/inventory-movement-category.enum';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';

export interface KardexLine {
  tenantId: string;
  variantId: string;
  quantity: number;
  /** Dirección: suma (`IN`) o resta (`OUT`) stock. */
  type: InventoryMovementType;
  category: InventoryMovementCategory;
  /** Detalle: el motivo del ajuste manual o el código del sistema (`VENTA`, `COMPRA`…). */
  reason: string;
  /** La sucursal donde se movió el stock: de la que sale (`OUT`) o a la que entra (`IN`). */
  branchId: string;
  /** Costo unitario de la línea: el de la capa que entra o el FIFO de lo que sale. */
  unitCost: number;
  /** Existencia de la sucursal y la variante justo después del movimiento (la que devuelve `consumeStock`/`receiveStock`). */
  balanceAfter: number;
  purchaseOrderId?: string;
  documentId?: string;
  /** Solo si el movimiento ocurrió antes de registrarse (venta hecha sin conexión). */
  createdAt?: Date;
}

/**
 * La única forma de crear una línea del kardex: ventas, compras, devoluciones, stock inicial y documentos pasan por aquí,
 * así todas llevan categoría, costo y saldo, y la sucursal de origen o destino sale de la dirección.
 */
export function newKardexLine(line: KardexLine): InventoryMovement {
  const movement = new InventoryMovement();
  movement.tenantId = line.tenantId;
  movement.variantId = line.variantId;
  movement.quantity = line.quantity;
  movement.type = line.type;
  movement.category = line.category;
  movement.reason = line.reason;
  movement.unitCost = line.unitCost;
  movement.balanceAfter = line.balanceAfter;
  movement.originBranchId = line.type === InventoryMovementType.OUT ? line.branchId : null;
  movement.destinationBranchId = line.type === InventoryMovementType.IN ? line.branchId : null;
  movement.purchaseOrderId = line.purchaseOrderId ?? null;
  movement.documentId = line.documentId ?? null;
  if (line.createdAt) movement.createdAt = line.createdAt;
  return movement;
}
