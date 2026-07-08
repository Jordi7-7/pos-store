import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Refund } from './refund.entity';
import { ProductVariant } from '../../../products/domain/entities/product-variant.entity';
import { ColumnNumericTransformer } from '../../../../common/database/numeric-transformer';

@Entity('refund_items')
export class RefundItem extends BaseEntity {
  @Column({ name: 'refund_id', type: 'uuid' })
  refundId: string;

  @ManyToOne(() => Refund, (refund) => refund.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'refund_id' })
  refund: Refund;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @ManyToOne(() => ProductVariant)
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  quantity: number;

  @Column({
    name: 'price_refunded',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  priceRefunded: number;
}
