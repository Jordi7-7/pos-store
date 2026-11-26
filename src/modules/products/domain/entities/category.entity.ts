import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

/** Índice único del nombre de categoría por tienda (entre las no eliminadas); lo crea la migración `AddUniqueCatalogNames`. */
export const CATEGORY_NAME_INDEX = 'UQ_categories_tenant_name';

@Entity('categories')
@Index(CATEGORY_NAME_INDEX, ['tenantId', 'name'], { unique: true, where: 'deleted_at IS NULL' })
export class Category extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  name: string;
}
