import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetSalesQuery } from './get-sales.query';
import { Sale } from '../../../domain/entities/sale.entity';

@QueryHandler(GetSalesQuery)
export class GetSalesHandler implements IQueryHandler<GetSalesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetSalesQuery): Promise<Sale[]> {
    const { tenantId } = query;
    const saleRepo = this.entityManager.getRepository(Sale);
    return saleRepo.find({
      where: { tenantId },
      relations: {
        branch: true,
        customer: true,
        user: true,
        items: {
          variant: {
            product: true,
          },
        },
        payments: true,
      },
      order: { createdAt: 'DESC' },
    });
  }
}
