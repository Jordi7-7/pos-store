import { Entity, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import { AttributeValue } from './attribute-value.entity';

/** Índice único del nombre de atributo por tienda (entre los no eliminados); lo crea la migración `AddUniqueCatalogNames`. */
export const ATTRIBUTE_NAME_INDEX = 'UQ_attributes_tenant_name';

@Entity('attributes')
@Index(ATTRIBUTE_NAME_INDEX, ['tenantId', 'name'], { unique: true, where: 'deleted_at IS NULL' })
export class Attribute extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column()
  name: string;

  @OneToMany(() => AttributeValue, (val) => val.attribute, { cascade: true })
  values: AttributeValue[];
}
