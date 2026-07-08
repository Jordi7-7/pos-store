import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import { Branch } from '../../../branches/domain/entities/branch.entity';
import { ProductVariant } from './product-variant.entity';
import { ColumnNumericTransformer } from '../../../../common/database/numeric-transformer';

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

  @Column({ name: 'purchase_order_id', type: 'uuid', nullable: true })
  purchaseOrderId: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  quantity: number;

  @Column()
  type: string;

  @Column()
  reason: string;
}
