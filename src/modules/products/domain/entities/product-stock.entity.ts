import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Branch } from '../../../branches/domain/entities/branch.entity';
import { ProductVariant } from './product-variant.entity';
import { ColumnNumericTransformer } from '../../../../common/database/numeric-transformer';

@Entity('product_stocks')
@Index(['branchId', 'variantId'], { unique: true })
export class ProductStock extends BaseEntity {
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @ManyToOne(() => ProductVariant, (variant) => variant.stocks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  quantity: number;
}
