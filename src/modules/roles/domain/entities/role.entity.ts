import { Entity, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import { User } from '../../../users/domain/entities/user.entity';

/** Índice único del nombre de rol por tienda; lo crea la migración `AddUniqueCatalogNames` (antes solo estaba declarado aquí, no existía en la base). */
export const ROLE_NAME_INDEX = 'UQ_roles_tenant_name';

@Entity('roles')
@Index(ROLE_NAME_INDEX, ['tenantId', 'name'], { unique: true, where: 'deleted_at IS NULL' })
export class Role extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  permissions: string[];

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @OneToMany(() => User, (user) => user.roleEntity)
  users: User[];
}
