import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Sale } from './sale.entity';
import { ColumnNumericTransformer } from '../../../../common/database/numeric-transformer';

export enum PaymentMethod {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  TARJETA = 'TARJETA',
  BILLETERA_DIGITAL = 'BILLETERA_DIGITAL',
}

@Entity('sale_payments')
export class SalePayment extends BaseEntity {
  @Column({ name: 'sale_id', type: 'uuid' })
  saleId: string;

  @ManyToOne(() => Sale, (sale) => sale.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @Column({
    type: 'varchar',
    name: 'payment_method',
  })
  paymentMethod: PaymentMethod;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;

  @Column({ name: 'reference_number', type: 'varchar', nullable: true })
  referenceNumber: string | null;
}
