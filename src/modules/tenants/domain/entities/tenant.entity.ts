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

  @Column({ type: 'varchar', unique: true })
  slug: string;

  @Column({ type: 'varchar', name: 'logo_url', nullable: true })
  logoUrl?: string | null;

  @Column({ default: 'America/Guayaquil' })
  timezone: string;
}
