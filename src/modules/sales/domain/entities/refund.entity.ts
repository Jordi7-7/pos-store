import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import { Branch } from '../../../branches/domain/entities/branch.entity';
import { Sale } from './sale.entity';
import { CashSession } from './cash-session.entity';
import { ColumnNumericTransformer } from '../../../../common/database/numeric-transformer';
import { RefundItem } from './refund-item.entity';

@Entity('refunds')
export class Refund extends BaseEntity {
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

  @Column({ name: 'sale_id', type: 'uuid' })
  saleId: string;

  @ManyToOne(() => Sale)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({ name: 'cash_session_id', type: 'uuid' })
  cashSessionId: string;

  @ManyToOne(() => CashSession)
  @JoinColumn({ name: 'cash_session_id' })
  cashSession: CashSession;

  @Column({
    name: 'total_refunded',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  totalRefunded: number;

  @Column()
  reason: string;

  @OneToMany(() => RefundItem, (item) => item.refund, { cascade: true })
  items: RefundItem[];
}
