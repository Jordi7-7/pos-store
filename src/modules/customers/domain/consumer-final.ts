import { EntityManager } from 'typeorm';
import { Customer } from './entities/customer.entity';

/** Comprador por defecto de cada tienda: ventas sin cliente identificado. */
export const CONSUMER_FINAL_IDENTITY = '9999999999999';
export const CONSUMER_FINAL_NAME = 'CONSUMIDOR FINAL';
export const CONSUMER_FINAL_EMAIL = 'consumidorfinal@example.com';
export const CONSUMER_FINAL_PHONE = '9999999999';

export function isConsumerFinal(customer: { identityNumber: string }): boolean {
  return customer.identityNumber === CONSUMER_FINAL_IDENTITY;
}

/**
 * El CONSUMIDOR FINAL de la tienda; si no existe (tienda antigua o borrado a mano) se crea. Dos ventas
 * simultáneas que lo creen a la vez no chocan: `ON CONFLICT DO NOTHING` deja pasar a una y la otra lo lee.
 */
export async function findOrCreateConsumerFinal(manager: EntityManager, tenantId: string): Promise<Customer> {
  const repo = manager.getRepository(Customer);
  const existing = await repo.findOne({ where: { tenantId, identityNumber: CONSUMER_FINAL_IDENTITY } });
  if (existing) return existing;

  await repo
    .createQueryBuilder()
    .insert()
    .values({ tenantId, identityNumber: CONSUMER_FINAL_IDENTITY, name: CONSUMER_FINAL_NAME, email: CONSUMER_FINAL_EMAIL, phone: CONSUMER_FINAL_PHONE })
    .orIgnore()
    .execute();
  return repo.findOneOrFail({ where: { tenantId, identityNumber: CONSUMER_FINAL_IDENTITY } });
}
