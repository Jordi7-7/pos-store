import { Entity, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';
import { Branch } from '../../../branches/domain/entities/branch.entity';
import { CashSession } from './cash-session.entity';
import { Customer } from '../../../customers/domain/entities/customer.entity';
import { User } from '../../../users/domain/entities/user.entity';
import { ColumnNumericTransformer } from '../../../../common/database/numeric-transformer';
import { SaleItem } from './sale-item.entity';
import { SalePayment } from './sale-payment.entity';
import { SaleStatus } from '../../../../common/enums/sale-status.enum';

/** Índice único que impide registrar dos veces la misma venta reintentada por el cliente. */
export const SALE_CLIENT_REQUEST_INDEX = 'UQ_sales_tenant_client_request';

/** Índice único del número provisional de una venta hecha sin conexión (por tienda). */
export const SALE_OFFLINE_REFERENCE_INDEX = 'UQ_sales_tenant_offline_reference';

@Entity('sales')
@Index(SALE_OFFLINE_REFERENCE_INDEX, ['tenantId', 'offlineReference'], { unique: true, where: '"offline_reference" IS NOT NULL' })
@Index(SALE_CLIENT_REQUEST_INDEX, ['tenantId', 'clientRequestId'], { unique: true, where: '"client_request_id" IS NOT NULL' })
export class Sale extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({ name: 'cash_session_id', type: 'uuid' })
  cashSessionId: string;

  @ManyToOne(() => CashSession)
  @JoinColumn({ name: 'cash_session_id' })
  cashSession: CashSession;

  @Column({ name: 'client_request_id', type: 'varchar', length: 64, nullable: true })
  clientRequestId: string | null;

  /** Número provisional que la aplicación imprimió en el comprobante al vender sin conexión; se puede buscar con él. */
  @Column({ name: 'offline_reference', type: 'varchar', length: 40, nullable: true })
  offlineReference: string | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  subtotal: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  total: number;

  @Column({ name: 'discount_type', type: 'varchar', nullable: true })
  discountType: string | null;

  @Column({
    name: 'discount_rate',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  discountRate: number | null;

  @Column({
    name: 'items_discount_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  itemsDiscountAmount: number;

  @Column({
    name: 'global_discount_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  globalDiscountAmount: number;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  discountAmount: number;

  @Column({ type: 'varchar', default: SaleStatus.COMPLETED })
  status: SaleStatus;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @OneToMany(() => SaleItem, (item) => item.sale, { cascade: true })
  items: SaleItem[];

  @OneToMany(() => SalePayment, (payment) => payment.sale, { cascade: true })
  payments: SalePayment[];

  @Column({ name: 'invoice_number', type: 'varchar', nullable: true })
  invoiceNumber: string | null;
}
