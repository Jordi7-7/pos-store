import { DataSource } from 'typeorm';
import { CloseCashSessionCommand } from '../../src/modules/sales/application/commands/close-cash-session/close-cash-session.command';
import { CloseCashSessionHandler } from '../../src/modules/sales/application/commands/close-cash-session/close-cash-session.handler';
import { CreateCashRegisterCommand } from '../../src/modules/sales/application/commands/create-cash-register/create-cash-register.command';
import { CreateCashRegisterHandler } from '../../src/modules/sales/application/commands/create-cash-register/create-cash-register.handler';
import { OpenCashSessionCommand } from '../../src/modules/sales/application/commands/open-cash-session/open-cash-session.command';
import { OpenCashSessionHandler } from '../../src/modules/sales/application/commands/open-cash-session/open-cash-session.handler';
import { UpdateCashRegisterCommand } from '../../src/modules/sales/application/commands/update-cash-register/update-cash-register.command';
import { UpdateCashRegisterHandler } from '../../src/modules/sales/application/commands/update-cash-register/update-cash-register.handler';
import { GetActiveCashSessionHandler } from '../../src/modules/sales/application/queries/get-active-cash-session/get-active-cash-session.handler';
import { GetActiveCashSessionQuery } from '../../src/modules/sales/application/queries/get-active-cash-session/get-active-cash-session.query';
import { GetCashRegistersHandler } from '../../src/modules/sales/application/queries/get-cash-registers/get-cash-registers.handler';
import { GetCashRegistersQuery } from '../../src/modules/sales/application/queries/get-cash-registers/get-cash-registers.query';
import { GetMyCashRegistersHandler } from '../../src/modules/sales/application/queries/get-my-cash-registers/get-my-cash-registers.handler';
import { GetMyCashRegistersQuery } from '../../src/modules/sales/application/queries/get-my-cash-registers/get-my-cash-registers.query';
import { Branch } from '../../src/modules/branches/domain/entities/branch.entity';
import { CashSession } from '../../src/modules/sales/domain/entities/cash-session.entity';
import { CashSessionStatus } from '../../src/modules/sales/domain/enums/cash-session-status.enum';
import { User } from '../../src/modules/users/domain/entities/user.entity';
import { redisStub, seedTenant, SeededTenant, startTestDatabase, TestDatabase } from './support/integration-database';

/** Cajas y apertura de turno con los handlers reales sobre Postgres. */
describe('Cajas registradoras y apertura de turno', () => {
  let database: TestDatabase;
  let db: DataSource;
  let shop: SeededTenant;
  let other: SeededTenant;
  let northBranchId: string;
  let cashierId: string;

  const createRegister = (name: string, branchId = shop.branchId, tenantId = shop.tenantId) =>
    new CreateCashRegisterHandler(db.manager).execute(new CreateCashRegisterCommand(tenantId, branchId, name));
  const updateRegister = (id: string, name?: string, isActive?: boolean, tenantId = shop.tenantId) =>
    new UpdateCashRegisterHandler(db.manager).execute(new UpdateCashRegisterCommand(tenantId, id, name, isActive));
  const open = (userId: string, cashRegisterId: string, openingBalance = 50, branchId = shop.branchId, tenantId = shop.tenantId) =>
    new OpenCashSessionHandler(db.manager, redisStub).execute(new OpenCashSessionCommand(tenantId, userId, branchId, openingBalance, cashRegisterId));
  const close = (sessionId: string) => new CloseCashSessionHandler(db.manager).execute(new CloseCashSessionCommand(shop.tenantId, sessionId, 50));
  const assign = (userId: string, registerId: string) => db.query(`INSERT INTO user_cash_registers (user_id, cash_register_id) VALUES ($1, $2)`, [userId, registerId]);
  const myRegisters = (userId: string, isOwner: boolean, branchId?: string) =>
    new GetMyCashRegistersHandler(db.manager).execute(new GetMyCashRegistersQuery(shop.tenantId, userId, isOwner, branchId));
  const activeSession = (userId: string, isOwner: boolean, branchId?: string, cashRegisterId?: string) =>
    new GetActiveCashSessionHandler(db.getRepository(CashSession), db.manager).execute(new GetActiveCashSessionQuery(shop.tenantId, userId, isOwner, branchId, cashRegisterId));

  beforeAll(async () => {
    database = await startTestDatabase('cash_registers');
    db = database.db;
    shop = await seedTenant(db, 'cajas');
    other = await seedTenant(db, 'cajas-ajena');
    northBranchId = (await db.getRepository(Branch).save(db.getRepository(Branch).create({ tenantId: shop.tenantId, name: 'Norte', address: 'x', code: 2 }))).id;
    cashierId = (await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Cajero', username: 'cajero-cajas', password: 'x', isOwner: false }))).id;
    await db.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [cashierId, shop.branchId]);
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  describe('crear y editar cajas', () => {
    it('numera las cajas por sucursal, recorta el nombre y empieza la factura en 1', async () => {
      const first = await createRegister('  Caja A  ');
      const second = await createRegister('Caja B');
      const north = await createRegister('Caja Norte', northBranchId);
      expect([first.code, second.code, north.code]).toEqual([1, 2, 1]);
      expect(first).toMatchObject({ name: 'Caja A', nextInvoiceNumber: 1, isActive: true });
    });

    it('una sucursal de otra tienda o inexistente se rechaza', async () => {
      await expect(createRegister('Caja X', other.branchId)).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
    });

    it('altas simultáneas en la misma sucursal reciben códigos distintos', async () => {
      const results = await Promise.allSettled([createRegister('P1'), createRegister('P2'), createRegister('P3')]);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const codes = results.map((r) => (r.status === 'fulfilled' ? r.value.code : 0));
      expect(new Set(codes).size).toBe(3);
    });

    it('edita nombre y estado; una caja de otra tienda no se puede tocar', async () => {
      const register = await createRegister('Editable');
      await expect(updateRegister(register.id, ' Renombrada ', false)).resolves.toMatchObject({ name: 'Renombrada', isActive: false });
      await expect(updateRegister(register.id, undefined, true)).resolves.toMatchObject({ name: 'Renombrada', isActive: true });
      await expect(updateRegister(register.id, 'Hackeada', undefined, other.tenantId)).rejects.toMatchObject({ code: 'CASH_REGISTER_NOT_FOUND' });
    });
  });

  describe('abrir un turno', () => {
    let register: { id: string; name: string };

    beforeAll(async () => {
      register = await createRegister('Principal');
    });

    it('el propietario abre con su saldo inicial y recibe el turno con sucursal, caja y usuario', async () => {
      const session = await open(shop.ownerId, register.id, 120.5);
      expect(session).toMatchObject({ status: CashSessionStatus.OPEN, openingBalance: 120.5, closingBalance: null, cashRegister: { id: register.id }, user: { id: shop.ownerId } });
      expect((await db.getRepository(CashSession).findOneByOrFail({ id: session.id })).openingBalance).toBe(120.5);
    });

    it('la misma caja no se abre dos veces: CASH_REGISTER_BUSY indicando quién la tiene', async () => {
      await expect(open(shop.ownerId, register.id)).rejects.toMatchObject({ code: 'CASH_REGISTER_BUSY', details: { cashRegisterName: 'Principal' } });
    });

    it('aperturas simultáneas de una caja libre: una gana y las demás reciben CASH_REGISTER_BUSY', async () => {
      const free = await createRegister('Carrera');
      const results = await Promise.allSettled([open(shop.ownerId, free.id), open(shop.ownerId, free.id), open(shop.ownerId, free.id)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const failed of results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')) {
        expect(failed.reason).toMatchObject({ code: 'CASH_REGISTER_BUSY' });
      }
      expect(await db.getRepository(CashSession).countBy({ cashRegisterId: free.id, status: CashSessionStatus.OPEN })).toBe(1);
    });

    it('una caja desactivada no se puede abrir', async () => {
      const off = await createRegister('Apagada');
      await updateRegister(off.id, undefined, false);
      await expect(open(shop.ownerId, off.id)).rejects.toMatchObject({ code: 'CASH_REGISTER_INACTIVE' });
    });

    it('una caja con turno abierto no se desactiva hasta cerrar el turno', async () => {
      const busy = await createRegister('Ocupada');
      const session = await open(shop.ownerId, busy.id);
      await expect(updateRegister(busy.id, undefined, false)).rejects.toMatchObject({ code: 'CASH_REGISTER_HAS_OPEN_SESSION' });
      expect((await db.query(`SELECT is_active FROM cash_registers WHERE id = $1`, [busy.id]))[0].is_active).toBe(true);

      await close(session.id);
      await expect(updateRegister(busy.id, undefined, false)).resolves.toMatchObject({ isActive: false });
    });

    it('caja de otra sucursal, sucursal ajena o inexistente se rechazan', async () => {
      const north = await createRegister('Solo norte', northBranchId);
      await expect(open(shop.ownerId, north.id, 0, shop.branchId)).rejects.toMatchObject({ code: 'CASH_REGISTER_NOT_FOUND' });
      await expect(open(shop.ownerId, register.id, 0, other.branchId)).rejects.toMatchObject({ code: 'BRANCH_NOT_FOUND' });
    });

    it('un usuario que no es propietario necesita la sucursal y la caja asignadas', async () => {
      const mine = await createRegister('Del cajero');
      const notMine = await createRegister('De otro');

      await expect(open(cashierId, mine.id)).rejects.toMatchObject({ code: 'CASH_REGISTER_NOT_ASSIGNED' });
      await assign(cashierId, mine.id);
      await expect(open(cashierId, notMine.id)).rejects.toMatchObject({ code: 'CASH_REGISTER_NOT_AUTHORIZED' });

      const northRegister = await createRegister('Norte del cajero', northBranchId);
      await assign(cashierId, northRegister.id);
      await expect(open(cashierId, northRegister.id, 0, northBranchId)).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED' });

      await expect(open(cashierId, mine.id, 10)).resolves.toMatchObject({ user: { id: cashierId } });
    });
  });

  describe('consultas', () => {
    it('las cajas del usuario: el propietario ve las activas; el cajero solo las asignadas; las desactivadas no aparecen', async () => {
      const ownerList = await myRegisters(shop.ownerId, true, shop.branchId);
      expect(ownerList.length).toBeGreaterThan(3);
      expect(ownerList.map((r) => r.name)).not.toContain('Apagada');

      const cashierList = await myRegisters(cashierId, false);
      expect(cashierList.map((r) => r.name).sort()).toEqual(['Del cajero', 'Norte del cajero']);
      expect(cashierList.find((r) => r.name === 'Del cajero')).toMatchObject({ isOpen: true });
      expect(cashierList.find((r) => r.name === 'Norte del cajero')).toMatchObject({ isOpen: false, activeSessionId: null });
    });

    it('un usuario sin cajas asignadas no ve ninguna', async () => {
      const stranger = (await db.getRepository(User).save(db.getRepository(User).create({ tenantId: shop.tenantId, name: 'Sin cajas', username: 'sin-cajas', password: 'x', isOwner: false }))).id;
      expect(await myRegisters(stranger, false)).toEqual([]);
    });

    it('el listado de administración trae estado, turno abierto y usuarios asignados', async () => {
      const list = await new GetCashRegistersHandler(db.manager).execute(new GetCashRegistersQuery(shop.tenantId, shop.branchId));
      const mine = list.find((r) => r.name === 'Del cajero');
      expect(mine).toMatchObject({ isOpen: true, isActive: true, assignedUserIds: [cashierId], activeSession: { userId: cashierId, userName: 'Cajero', openingBalance: 10 } });
      expect(list.find((r) => r.name === 'Apagada')).toMatchObject({ isActive: false, isOpen: false });
      expect(list.every((r) => r.branchId === shop.branchId)).toBe(true);
      expect(list.map((r) => r.code)).toEqual([...list.map((r) => r.code)].sort((a, b) => a - b));
    });

    it('el turno activo se limita a lo que el usuario puede operar', async () => {
      expect(await activeSession(cashierId, false, shop.branchId)).toMatchObject({ status: CashSessionStatus.OPEN, openedByName: 'Cajero', cashRegisterName: 'Del cajero' });
      expect(await activeSession(cashierId, false, northBranchId)).toBeNull();

      const principal = await db.query(`SELECT id FROM cash_registers WHERE name = 'Principal'`);
      expect(await activeSession(cashierId, false, shop.branchId, principal[0].id)).toBeNull();
      expect(await activeSession(shop.ownerId, true, shop.branchId, principal[0].id)).toMatchObject({ cashRegisterName: 'Principal', openingBalance: 120.5 });
    });
  });
});
