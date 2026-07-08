import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

@Entity('suppliers')
export class Supplier extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'identity_number' })
  identityNumber: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;
}
