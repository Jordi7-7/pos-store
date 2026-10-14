import { Entity, Column, ManyToOne, JoinColumn, OneToMany, ManyToMany, JoinTable, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import { ProductVariant } from './product-variant.entity';
import { ProductImage } from './product-image.entity';
import { Category } from './category.entity';
import { ProductType } from '../enums/product-type.enum';

@Entity('products')
@Index('idx_products_tenant_base_sku', ['tenantId', 'baseSku'], { where: 'deleted_at IS NULL' })
export class Product extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category)
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @Column()
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: ProductType,
    default: ProductType.SIMPLE,
  })
  type: ProductType;

  @Column({ name: 'base_sku', type: 'varchar', nullable: true })
  baseSku: string | null;

  @OneToMany(() => ProductVariant, (variant) => variant.product, { cascade: true })
  variants: ProductVariant[];

  @ManyToMany(() => ProductImage)
  @JoinTable({
    name: 'product_image_mappings',
    joinColumn: { name: 'product_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'product_image_id', referencedColumnName: 'id' },
  })
  images: ProductImage[];
}
