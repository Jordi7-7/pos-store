import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { GetProfileQuery } from './get-profile.query';
import { User } from '../../../../users/domain/entities/user.entity';
import { resolveEffectivePermissions } from '../../../domain/effective-permissions';

export interface Profile {
  id: string;
  name: string;
  username: string | null | undefined;
  email: string | null | undefined;
  isOwner: boolean;
  role: { id: string; name: string } | null;
  permissions: string[];
  branches: Array<{ id: string; name: string; address: string | null }>;
  cashRegisters: Array<{ id: string; name: string; code: number; branchId: string }>;
  tenant: {
    id: string;
    name: string;
    ruc: string;
    slug: string;
    logoUrl: string | null;
    country: string;
    timezone: string;
    currencyCode: string;
    currencySymbol: string;
  };
}

@QueryHandler(GetProfileQuery)
export class GetProfileHandler implements IQueryHandler<GetProfileQuery> {
  private readonly logger = new Logger(GetProfileHandler.name);

  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: GetProfileQuery): Promise<Profile> {
    const { tenantId, userId } = query;

    const user = await this.entityManager.findOne(User, {
      where: { id: userId, tenantId },
      relations: { tenant: true, roleEntity: true, branches: true, cashRegisters: true },
    });
    if (!user) {
      this.logger.warn(`Profile not found for User ID ${userId} under Tenant ${tenantId}`);
      throw new UnauthorizedException('User not found');
    }

    const { tenant } = user;
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      isOwner: user.isOwner,
      role: !user.isOwner && user.roleEntity ? { id: user.roleEntity.id, name: user.roleEntity.name } : null,
      permissions: resolveEffectivePermissions(user),
      branches: (user.branches ?? []).map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address || null,
      })),
      cashRegisters: (user.cashRegisters ?? []).map((register) => ({
        id: register.id,
        name: register.name,
        code: register.code,
        branchId: register.branchId,
      })),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        ruc: tenant.ruc,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl || null,
        country: tenant.country,
        timezone: tenant.timezone,
        currencyCode: tenant.currencyCode,
        currencySymbol: tenant.currencySymbol,
      },
    };
  }
}
