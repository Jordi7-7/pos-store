import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/database/base.entity';
import { Attribute } from './attribute.entity';

/** Índice único de una opción dentro de su atributo (entre las no eliminadas); lo crea la migración `AddUniqueCatalogNames`. */
export const ATTRIBUTE_VALUE_INDEX = 'UQ_attribute_values_attribute_value';

@Entity('attribute_values')
@Index(ATTRIBUTE_VALUE_INDEX, ['attributeId', 'value'], { unique: true, where: 'deleted_at IS NULL' })
export class AttributeValue extends BaseEntity {
  @Column({ name: 'attribute_id', type: 'uuid' })
  attributeId: string;

  @ManyToOne(() => Attribute, (attr) => attr.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_id' })
  attribute: Attribute;

  @Column()
  value: string;

  /** Posición de la opción dentro de su atributo (S, M, L, XL…): menor sale primero. */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
