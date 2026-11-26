import { EntityManager } from 'typeorm';
import { AttributeValue } from '../../domain/entities/attribute-value.entity';

/** Posición de una opción nueva: al final de las que el atributo ya tiene. */
export async function nextValueSortOrder(manager: EntityManager, attributeId: string): Promise<number> {
  const row = await manager.getRepository(AttributeValue).createQueryBuilder('value').select('MAX(value.sortOrder)', 'max').where('value.attributeId = :attributeId', { attributeId }).getRawOne<{ max: number | string | null }>();
  return row?.max === null || row?.max === undefined ? 1 : Number(row.max) + 1;
}
