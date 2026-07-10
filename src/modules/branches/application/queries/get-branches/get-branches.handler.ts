import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetBranchesQuery } from './get-branches.query';
import { Branch } from '../../../domain/entities/branch.entity';

@QueryHandler(GetBranchesQuery)
export class GetBranchesHandler implements IQueryHandler<GetBranchesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetBranchesQuery): Promise<Branch[]> {
    const { tenantId } = query;
    const branchRepo = this.entityManager.getRepository(Branch);
    return branchRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }
}
