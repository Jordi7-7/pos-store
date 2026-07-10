import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetCustomersQuery } from './get-customers.query';
import { Customer } from '../../../domain/entities/customer.entity';

@QueryHandler(GetCustomersQuery)
export class GetCustomersHandler implements IQueryHandler<GetCustomersQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetCustomersQuery): Promise<Customer[]> {
    const { tenantId } = query;
    const customerRepo = this.entityManager.getRepository(Customer);
    return customerRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }
}
