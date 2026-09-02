import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

@Entity('users')
@Index(['tenantId', 'email'], { unique: true })
@Index(['tenantId', 'username'], { unique: true })
export class User extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  username?: string;

  @Column()
  email: string;

  @Column({ select: false })
  password?: string;

  @Column()
  role: string;

  @Column({ type: 'varchar', nullable: true, select: false })
  pin?: string;

  @Column({ name: 'pin_enabled', default: false })
  pinEnabled: boolean;
}
