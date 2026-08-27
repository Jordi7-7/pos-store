import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

@Entity('branches')
export class Branch extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'integer', nullable: true, default: 1 })
  code?: number;

  @Column()
  name: string;

  @Column()
  address: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
