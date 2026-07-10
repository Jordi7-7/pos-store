import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetSuppliersQuery } from './get-suppliers.query';
import { Supplier } from '../../../domain/entities/supplier.entity';

@QueryHandler(GetSuppliersQuery)
export class GetSuppliersHandler implements IQueryHandler<GetSuppliersQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetSuppliersQuery): Promise<Supplier[]> {
    const { tenantId } = query;
    const supplierRepo = this.entityManager.getRepository(Supplier);
    return supplierRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }
}
