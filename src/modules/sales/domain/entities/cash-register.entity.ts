import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Branch } from '../../../branches/domain/entities/branch.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

@Entity('cash_registers')
export class CashRegister extends BaseEntity {
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

  @Column({ type: 'integer' })
  code: number;

  @Column()
  name: string;

  @Column({ name: 'next_invoice_number', type: 'integer', default: 1 })
  nextInvoiceNumber: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
