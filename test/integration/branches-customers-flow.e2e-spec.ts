import { DataSource } from 'typeorm';
import { CreateBranchCommand } from '../../src/modules/branches/application/commands/create-branch/create-branch.command';
import { CreateBranchHandler } from '../../src/modules/branches/application/commands/create-branch/create-branch.handler';
import { UpdateBranchCommand } from '../../src/modules/branches/application/commands/update-branch/update-branch.command';
import { UpdateBranchHandler } from '../../src/modules/branches/application/commands/update-branch/update-branch.handler';
import { GetBranchesHandler } from '../../src/modules/branches/application/queries/get-branches/get-branches.handler';
import { GetBranchesQuery } from '../../src/modules/branches/application/queries/get-branches/get-branches.query';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { CreateCustomerCommand } from '../../src/modules/customers/application/commands/create-customer/create-customer.command';
import { CreateCustomerHandler } from '../../src/modules/customers/application/commands/create-customer/create-customer.handler';
import { DeleteCustomerCommand } from '../../src/modules/customers/application/commands/delete-customer/delete-customer.command';
import { DeleteCustomerHandler } from '../../src/modules/customers/application/commands/delete-customer/delete-customer.handler';
import { UpdateCustomerCommand } from '../../src/modules/customers/application/commands/update-customer/update-customer.command';
import { UpdateCustomerHandler } from '../../src/modules/customers/application/commands/update-customer/update-customer.handler';
import { GetCustomersHandler } from '../../src/modules/customers/application/queries/get-customers/get-customers.handler';
import { GetCustomersQuery } from '../../src/modules/customers/application/queries/get-customers/get-customers.query';
import { Customer } from '../../src/modules/customers/domain/entities/customer.entity';
import { seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Sucursales y clientes con los handlers reales sobre Postgres: aislamiento por tienda y carreras. */
describe('Sucursales y clientes', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;

  const createBranch = (name: string, tenantId = shop.tenantId) =>
    new CreateBranchHandler(db.manager).execute(new CreateBranchCommand(tenantId, name, 'Dirección'));
  const createCustomer = (identityNumber: string, tenantId = shop.tenantId, extra: { email?: string | null; phone?: string | null } = {}) =>
    new CreateCustomerHandler(db.getRepository(Customer)).execute(new CreateCustomerCommand(tenantId, { identityNumber, name: `Cliente ${identityNumber}`, ...extra }));
  const updateCustomer = (id: string, input: ConstructorParameters<typeof UpdateCustomerCommand>[2], tenantId = shop.tenantId) =>
    new UpdateCustomerHandler(db.getRepository(Customer)).execute(new UpdateCustomerCommand(tenantId, id, input));
  const deleteCustomer = (id: string, tenantId = shop.tenantId) =>
    new DeleteCustomerHandler(db.getRepository(Customer)).execute(new DeleteCustomerCommand(tenantId, id));

  beforeAll(async () => {
    database = await startTestDatabase('branches_customers');
    db = database.db;
    shop = await seedTenant(db, 'sucursales');
    other = await seedTenant(db, 'ajena2');
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('sucursales', () => {
    it('numera las sucursales a continuación de la matriz y recorta los espacios', async () => {
      const branch = await createBranch('  Norte  ');
      expect(branch).toMatchObject({ name: 'Norte', code: 2, isActive: true });
    });

    it('rechaza un nombre repetido en la misma tienda, pero lo permite en otra', async () => {
      await expect(createBranch('Norte')).rejects.toMatchObject({ code: 'BRANCH_NAME_TAKEN' });
      await expect(createBranch('Norte', other.tenantId)).resolves.toMatchObject({ name: 'Norte' });
    });

    it('el código no se repite aunque se borre una sucursal intermedia', async () => {
      const sur = await createBranch('Sur');
      await db.getRepository(Branch).softDelete(sur.id);
      const este = await createBranch('Este');
      expect(este.code).toBe((sur.code ?? 0) + 1);
    });

    it('altas simultáneas: nombres distintos reciben códigos distintos y el mismo nombre solo se crea una vez', async () => {
      const results = await Promise.allSettled([createBranch('Paralela A'), createBranch('Paralela B'), createBranch('Paralela C')]);
      const codes = results.map((r) => (r.status === 'fulfilled' ? r.value.code : null));
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(new Set(codes).size).toBe(3);

      const same = await Promise.allSettled([createBranch('Misma'), createBranch('Misma')]);
      expect(same.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((same.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'BRANCH_NAME_TAKEN' });
    });

    it('edita nombre, dirección y estado; no permite renombrar a un nombre ajeno ni tocar otra tienda', async () => {
      const [norte] = await db.getRepository(Branch).findBy({ tenantId: shop.tenantId, name: 'Norte' });
      const updated = await new UpdateBranchHandler(db.manager).execute(new UpdateBranchCommand(shop.tenantId, norte.id, 'Norte 2', ' Av. 1 ', false));
      expect(updated).toMatchObject({ name: 'Norte 2', address: 'Av. 1', isActive: false });

      await expect(new UpdateBranchHandler(db.manager).execute(new UpdateBranchCommand(shop.tenantId, norte.id, 'Este'))).rejects.toMatchObject({ code: 'BRANCH_NAME_TAKEN' });
      await expect(new UpdateBranchHandler(db.manager).execute(new UpdateBranchCommand(other.tenantId, norte.id, 'Hackeada'))).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
      expect((await db.getRepository(Branch).findOneByOrFail({ id: norte.id })).name).toBe('Norte 2');
    });

    it('el listado solo trae las sucursales activas de la tienda, sin las borradas ni las ajenas', async () => {
      const list = await new GetBranchesHandler(db.manager).execute(new GetBranchesQuery(shop.tenantId));
      const names = list.map((b) => b.name);
      expect(names).toEqual(expect.arrayContaining(['Matriz', 'Norte 2', 'Este']));
      expect(names).not.toContain('Sur');
      expect(list.every((b) => b.tenantId === shop.tenantId)).toBe(true);
    });
  });

  describe('clientes', () => {
    it('crea un cliente y normaliza correo y teléfono vacíos a null', async () => {
      const customer = await createCustomer('0102030405', shop.tenantId, { email: '  ', phone: ' 099 ' });
      expect(customer).toMatchObject({ identityNumber: '0102030405', email: null, phone: '099' });
    });

    it('rechaza el mismo documento en la tienda, pero lo permite en otra', async () => {
      await expect(createCustomer('0102030405')).rejects.toMatchObject({ code: 'CUSTOMER_IDENTITY_TAKEN' });
      await expect(createCustomer('0102030405', other.tenantId)).resolves.toBeDefined();
    });

    it('dos altas simultáneas con el mismo documento: una gana y la otra recibe CUSTOMER_IDENTITY_TAKEN, no un 500', async () => {
      const results = await Promise.allSettled([createCustomer('1111111111'), createCustomer('1111111111')]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'CUSTOMER_IDENTITY_TAKEN' });
    });

    it('edita datos, rechaza un documento ajeno y no toca clientes de otra tienda', async () => {
      const a = await createCustomer('2222222222');
      await createCustomer('3333333333');

      const updated = await updateCustomer(a.id, { name: 'Nuevo nombre', phone: null });
      expect(updated).toMatchObject({ name: 'Nuevo nombre', phone: null, identityNumber: '2222222222' });

      await expect(updateCustomer(a.id, { identityNumber: '3333333333' })).rejects.toMatchObject({ code: 'CUSTOMER_IDENTITY_TAKEN' });
      await expect(updateCustomer(a.id, { name: 'Robado' }, other.tenantId)).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    });

    it('un cliente borrado deja de listarse y su documento puede volver a registrarse', async () => {
      const customer = await createCustomer('4444444444');
      await deleteCustomer(customer.id);

      const list = await new GetCustomersHandler(db.getRepository(Customer)).execute(new GetCustomersQuery(shop.tenantId));
      expect(list.map((c) => c.identityNumber)).not.toContain('4444444444');

      await expect(createCustomer('4444444444')).resolves.toMatchObject({ identityNumber: '4444444444' });
      await expect(deleteCustomer(customer.id)).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
    });

    it('no se puede borrar un cliente de otra tienda', async () => {
      const mine = await createCustomer('5555555555');
      await expect(deleteCustomer(mine.id, other.tenantId)).rejects.toMatchObject({ code: 'CUSTOMER_NOT_FOUND' });
      expect(await db.getRepository(Customer).findOneBy({ id: mine.id })).not.toBeNull();
    });
  });
});
