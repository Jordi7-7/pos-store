import { Entity, Column, ManyToOne, JoinColumn, Index, ManyToMany, JoinTable } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import type { Role } from '../../../roles/domain/entities/role.entity';
import type { Branch } from '../../../branches/domain/entities/branch.entity';
import type { CashRegister } from '../../../sales/domain/entities/cash-register.entity';

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

  @Column({ type: 'varchar', nullable: false })
  username: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string | null;

  @Column({ select: false })
  password?: string;

  @Column({ name: 'is_owner', type: 'boolean', default: false })
  isOwner: boolean;

  @Column({ name: 'role_id', type: 'uuid', nullable: true })
  roleId?: string | null;

  @ManyToOne('Role', 'users', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  roleEntity?: Role | null;

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
  branches?: Branch[];

  @ManyToMany('CashRegister', { cascade: false })
  @JoinTable({
    name: 'user_cash_registers',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'cash_register_id', referencedColumnName: 'id' },
  })
  cashRegisters?: CashRegister[];
}
