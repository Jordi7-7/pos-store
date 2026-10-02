import { Entity, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import { Branch } from '../../../branches/domain/entities/branch.entity';
import { PurchaseOrder } from '../../../purchases/domain/entities/purchase-order.entity';
import { ProductBatch } from '../../../products/domain/entities/product-batch.entity';

export enum BatchOriginType {
  PURCHASE = 'PURCHASE',
  INITIAL_STOCK = 'INITIAL_STOCK',
  ADJUSTMENT = 'ADJUSTMENT',
  REFUND = 'REFUND',
}

export enum BatchStatus {
  ACTIVE = 'ACTIVE',
  DEPLETED = 'DEPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('batches')
@Index(['tenantId', 'branchId'])
@Index(['tenantId', 'status'])
export class Batch extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ name: 'purchase_order_id', type: 'uuid', nullable: true })
  purchaseOrderId: string | null;

  @ManyToOne(() => PurchaseOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder: PurchaseOrder | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  code: string | null;

  @Column({
    name: 'origin_type',
    type: 'varchar',
    length: 50,
    default: BatchOriginType.PURCHASE,
  })
  originType: BatchOriginType | string;

  @Column({
    type: 'varchar',
    length: 50,
    default: BatchStatus.ACTIVE,
  })
  status: BatchStatus | string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => ProductBatch, (pb) => pb.batch, { cascade: true })
  items: ProductBatch[];
}

export default Batch;
