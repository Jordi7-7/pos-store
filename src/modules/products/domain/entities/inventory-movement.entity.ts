import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import { Branch } from '../../../branches/domain/entities/branch.entity';
import { InventoryDocument } from './inventory-document.entity';
import { ProductVariant } from './product-variant.entity';
import { ColumnNumericTransformer } from '../../../../common/database/numeric-transformer';
import { InventoryMovementType } from '../../../../common/enums/inventory-movement-type.enum';
import { InventoryMovementCategory } from '../../../../common/enums/inventory-movement-category.enum';

@Entity('inventory_movements')
export class InventoryMovement extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'origin_branch_id', type: 'uuid', nullable: true })
  originBranchId: string | null;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'origin_branch_id' })
  originBranch: Branch | null;

  @Column({ name: 'destination_branch_id', type: 'uuid', nullable: true })
  destinationBranchId: string | null;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'destination_branch_id' })
  destinationBranch: Branch | null;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId: string | null;

  @ManyToOne(() => InventoryDocument, { nullable: true })
  @JoinColumn({ name: 'document_id' })
  document: InventoryDocument | null;

  @Column({ name: 'purchase_order_id', type: 'uuid', nullable: true })
  purchaseOrderId: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  quantity: number;

  /** Dirección: si la línea suma (`IN`) o resta (`OUT`) stock en una sucursal. */
  @Column({ type: 'varchar' })
  type: InventoryMovementType;

  /** Clase de operación; la única clasificación para filtrar. Nulo solo en filas escritas por una versión anterior de la API. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  category: InventoryMovementCategory | null;

  /** Detalle del movimiento (el motivo del ajuste manual, o el código del sistema: `VENTA`, `COMPRA`…). */
  @Column()
  reason: string;

  /** Costo unitario de esta línea al moverse: el de la capa que entra, o el FIFO de lo que sale. Nulo en filas anteriores. */
  @Column({
    name: 'unit_cost',
    type: 'numeric',
    precision: 12,
    scale: 4,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  unitCost: number | null;

  /** Existencia de esa sucursal y variante justo después de este movimiento. Nulo en filas anteriores. */
  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  balanceAfter: number | null;
}
