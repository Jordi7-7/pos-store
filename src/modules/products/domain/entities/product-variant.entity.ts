import { Entity, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Product } from './product.entity';
import { AttributeValue } from './attribute-value.entity';
import { ColumnNumericTransformer } from '../../../../common/database/numeric-transformer';
import { ProductStock } from './product-stock.entity';
import { ProductImage } from './product-image.entity';

@Entity('product_variants')
export class ProductVariant extends BaseEntity {
  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ unique: true })
  sku: string;

  @Column({ unique: true })
  barcode: string;

  @Column({
    name: 'purchase_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  purchasePrice: number;

  @Column({
    name: 'sale_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  salePrice: number;

  @Column({ name: 'image_url', type: 'varchar', nullable: true })
  imageUrl: string | null;

  @ManyToMany(() => AttributeValue)
  @JoinTable({
    name: 'variant_attribute_values',
    joinColumn: { name: 'variant_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'attribute_value_id', referencedColumnName: 'id' },
  })
  attributeValues: AttributeValue[];

  @ManyToMany(() => ProductImage)
  @JoinTable({
    name: 'product_variant_image_mappings',
    joinColumn: { name: 'product_variant_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'product_image_id', referencedColumnName: 'id' },
  })
  images: ProductImage[];

  @OneToMany(() => ProductStock, (stock) => stock.variant, { cascade: true })
  stocks: ProductStock[];
}
