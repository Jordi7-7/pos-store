import { EntityManager } from 'typeorm';
import { DateTime } from 'luxon';
import { Tenant } from '../../../tenants/domain/entities/tenant.entity';

export async function parseReportDates(
  entityManager: EntityManager,
  tenantId: string,
  startDate?: string,
  endDate?: string,
): Promise<{ start: Date; end: Date }> {
  const tenant = await entityManager.findOne(Tenant, {
    where: { id: tenantId }
  });
  const timezone = tenant?.timezone || 'America/Guayaquil';

  const start = startDate 
    ? DateTime.fromISO(startDate, { zone: timezone }).startOf('day').toJSDate()
    : DateTime.now().setZone(timezone).startOf('month').toJSDate();
    
  const end = endDate 
    ? DateTime.fromISO(endDate, { zone: timezone }).endOf('day').toJSDate()
    : DateTime.now().setZone(timezone).endOf('day').toJSDate();

  return { start, end };
}
