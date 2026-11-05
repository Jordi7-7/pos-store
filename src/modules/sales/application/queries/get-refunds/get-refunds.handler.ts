import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager, FindOptionsWhere } from 'typeorm';
import { GetRefundsQuery } from './get-refunds.query';
import { Refund } from '../../../domain/entities/refund.entity';

@QueryHandler(GetRefundsQuery)
export class GetRefundsHandler implements IQueryHandler<GetRefundsQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetRefundsQuery): Promise<Refund[]> {
    const { tenantId, cashSessionId, saleId } = query;
    const where: FindOptionsWhere<Refund> = { tenantId };
    if (cashSessionId) where.cashSessionId = cashSessionId;
    if (saleId) where.saleId = saleId;

    return this.entityManager.getRepository(Refund).find({
      where,
      relations: { items: { variant: { product: true } } },
      order: { createdAt: 'DESC' },
    });
  }
}
