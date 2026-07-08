import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';

@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  ruc: string;

  @Column()
  country: string;

  @Column({ name: 'currency_code' })
  currencyCode: string;

  @Column({ name: 'currency_symbol' })
  currencySymbol: string;
}
