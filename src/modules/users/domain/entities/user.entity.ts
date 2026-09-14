import { Entity, Column, ManyToOne, JoinColumn, Index, ManyToMany, JoinTable } from 'typeorm';
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

  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId?: string | null;

  @ManyToOne('Role', 'users', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  roleEntity?: any;

  @Column({ type: 'text', array: true, nullable: true, name: 'custom_permissions' })
  customPermissions?: string[] | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  pin?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ManyToMany('Branch', { cascade: false })
  @JoinTable({
    name: 'user_branches',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'branch_id', referencedColumnName: 'id' },
  })
  branches?: any[];

  @ManyToMany('CashRegister', { cascade: false })
  @JoinTable({
    name: 'user_cash_registers',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'cash_register_id', referencedColumnName: 'id' },
  })
  cashRegisters?: any[];
}
