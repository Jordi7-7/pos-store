import { EntityManager } from 'typeorm';
import { Role } from '../../../../roles/domain/entities/role.entity';
import { User } from '../../../domain/entities/user.entity';
import { ListUsersHandler } from './list-users.handler';
import { ListUsersQuery } from './list-users.query';

describe('ListUsersHandler', () => {
  const user = (overrides: Partial<User>): User =>
    ({
      id: 'u1',
      name: 'Ana',
      username: null,
      email: 'ana@x.com',
      isOwner: false,
      isActive: true,
      roleEntity: null,
      branches: [],
      customPermissions: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...overrides,
    }) as unknown as User;

  const handlerFor = (entities: User[], raw: Array<{ hasPin?: boolean | string }>) => {
    const where = jest.fn();
    const qb: Record<string, unknown> = {
      leftJoinAndSelect: () => qb,
      addSelect: () => qb,
      where: (...args: unknown[]) => {
        where(...args);
        return qb;
      },
      orderBy: () => qb,
      getRawAndEntities: () => Promise.resolve({ entities, raw }),
    };
    const manager = { getRepository: () => ({ createQueryBuilder: () => qb }) } as unknown as EntityManager;
    return { handler: new ListUsersHandler(manager), where };
  };

  it('filtra por tenant y nunca expone el PIN, solo si tiene', async () => {
    const { handler, where } = handlerFor([user({})], [{ hasPin: 'true' }]);

    const [item] = await handler.execute(new ListUsersQuery('t1'));

    expect(where).toHaveBeenCalledWith('user.tenantId = :tenantId', { tenantId: 't1' });
    expect(item.hasPin).toBe(true);
    expect(item).not.toHaveProperty('pin');
    expect(item).not.toHaveProperty('password');
  });

  it('muestra al propietario como rol "Propietario" y al resto con su rol', async () => {
    const { handler } = handlerFor(
      [
        user({ id: 'o', isOwner: true }),
        user({ id: 'c', roleEntity: { id: 'r1', name: 'Cajero' } as Role }),
        user({ id: 'n' }),
      ],
      [{}, {}, {}],
    );

    const items = await handler.execute(new ListUsersQuery('t1'));

    expect(items.map((i) => i.role)).toEqual([{ id: 'owner', name: 'Propietario' }, { id: 'r1', name: 'Cajero' }, null]);
  });
});
