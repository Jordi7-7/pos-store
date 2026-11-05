import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { ListRolesQuery } from './list-roles.query';
import { Role } from '../../../domain/entities/role.entity';
import { User } from '../../../../users/domain/entities/user.entity';

export type RoleWithUserCount = Role & { userCount: number };

@QueryHandler(ListRolesQuery)
export class ListRolesHandler implements IQueryHandler<ListRolesQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: ListRolesQuery): Promise<RoleWithUserCount[]> {
    const { tenantId } = query;

    const roles = await this.entityManager.getRepository(Role).find({
      where: { tenantId },
      order: { isSystem: 'DESC', createdAt: 'ASC' },
    });

    // Usuarios asignados por rol (el propietario no requiere rol, no cuenta)
    const counts = await this.entityManager
      .getRepository(User)
      .createQueryBuilder('user')
      .select('user.roleId', 'roleId')
      .addSelect('COUNT(user.id)', 'count')
      .where('user.tenantId = :tenantId', { tenantId })
      .andWhere('user.isOwner = false')
      .groupBy('user.roleId')
      .getRawMany<{ roleId: string; count: string }>();

    const countByRole = new Map(counts.map((row) => [row.roleId, Number(row.count)]));

    return roles.map((role) => Object.assign(role, { userCount: countByRole.get(role.id) ?? 0 }));
  }
}
