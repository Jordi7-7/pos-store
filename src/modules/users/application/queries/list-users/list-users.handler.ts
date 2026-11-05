import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { ListUsersQuery } from './list-users.query';
import { User } from '../../../domain/entities/user.entity';

export interface UserListItem {
  id: string;
  name: string;
  username: string | null;
  email: string | null | undefined;
  isOwner: boolean;
  isActive: boolean;
  role: { id: string; name: string } | null;
  hasPin: boolean;
  branches: Array<{ id: string; name: string; address: string | null }>;
  customPermissions: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<ListUsersQuery> {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(query: ListUsersQuery): Promise<UserListItem[]> {
    const { entities, raw } = await this.entityManager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleEntity', 'roleEntity')
      .leftJoinAndSelect('user.branches', 'branches')
      .addSelect("CASE WHEN user.pin IS NOT NULL AND user.pin != '' THEN true ELSE false END", 'hasPin')
      .where('user.tenantId = :tenantId', { tenantId: query.tenantId })
      .orderBy('user.createdAt', 'ASC')
      .getRawAndEntities<{ hasPin?: boolean | string }>();

    return entities.map((user, index) => ({
      id: user.id,
      name: user.name,
      username: user.username || null,
      email: user.email,
      isOwner: user.isOwner,
      isActive: user.isActive,
      role: this.roleOf(user),
      hasPin: raw[index]?.hasPin === true || raw[index]?.hasPin === 'true',
      branches: (user.branches ?? []).map((branch) => ({
        id: branch.id,
        name: branch.name,
        address: branch.address || null,
      })),
      customPermissions: user.customPermissions || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }

  private roleOf(user: User): UserListItem['role'] {
    if (user.isOwner) {
      return { id: 'owner', name: 'Propietario' };
    }
    return user.roleEntity ? { id: user.roleEntity.id, name: user.roleEntity.name } : null;
  }
}
