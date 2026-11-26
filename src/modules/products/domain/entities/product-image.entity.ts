import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { publicUrlTransformer } from '../../../../common/storage/public-url';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

@Entity('product_images')
export class ProductImage extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** En la base va solo la clave del archivo; la entidad la ve como dirección pública (ver `public-url`). */
  @Column({ transformer: publicUrlTransformer })
  url: string;

  @Column({ nullable: true })
  description?: string;
}


