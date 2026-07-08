import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

@Entity('customers')
@Index(['tenantId', 'identityNumber'], { unique: true })
export class Customer extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'identity_number' })
  identityNumber: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column()
  phone: string;
}
