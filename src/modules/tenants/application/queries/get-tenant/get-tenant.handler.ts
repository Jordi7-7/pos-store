import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { HttpStatus } from '@nestjs/common';
import { GetTenantQuery } from './get-tenant.query';
import { Tenant } from '../../../domain/entities/tenant.entity';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@QueryHandler(GetTenantQuery)
export class GetTenantHandler implements IQueryHandler<GetTenantQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetTenantQuery): Promise<Tenant> {
    const tenant = await this.entityManager.findOne(Tenant, {
      where: { id: query.id },
    });
    if (!tenant) {
      throw new AppException(ErrorCode.TenantNotFound, 'Tienda no encontrada.', HttpStatus.NOT_FOUND, { id: query.id });
    }
    return tenant;
  }
}
