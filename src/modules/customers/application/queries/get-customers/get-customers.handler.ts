import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GetCustomersQuery } from './get-customers.query';
import { Customer } from '../../../domain/entities/customer.entity';

@QueryHandler(GetCustomersQuery)
export class GetCustomersHandler implements IQueryHandler<GetCustomersQuery> {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async execute(query: GetCustomersQuery): Promise<Customer[]> {
    const { tenantId } = query;
    return this.customerRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }
}
