import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

@Entity('categories')
export class Category extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  name: string;
}
