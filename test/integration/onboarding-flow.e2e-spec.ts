import { DataSource } from 'typeorm';
import { OnboardTenantCommand } from '../../src/modules/auth/application/commands/onboard/onboard-tenant.command';
import { OnboardTenantHandler } from '../../src/modules/auth/application/commands/onboard/onboard-tenant.handler';
import { HashService } from '../../src/modules/auth/services/hash.service';
import { Tenant } from '../../src/modules/tenants/domain/entities/tenant.entity';
import { startTestDatabase, TestDatabase } from './support/integration-database';

/** Alta de una tienda con el handler real: qué se crea, qué se rechaza y qué pasa con altas simultáneas. */
describe('Alta de tienda (onboarding)', () => {
  let database: TestDatabase;
  let db: DataSource;

  const onboard = (overrides: Partial<{ ruc: string; slug: string; username: string; email: string | null }> = {}) =>
    new OnboardTenantHandler(db.manager, new HashService()).execute(
      new OnboardTenantCommand(
        'Ferretería El Ñandú',
        overrides.ruc ?? '0991234567001',
        'EC',
        'USD',
        '$',
        'America/Guayaquil',
        'Ana Dueña',
        overrides.username ?? 'Ana.Duena',
        'clave-segura-1',
        'Matriz',
        'Centro',
        overrides.email === undefined ? `${overrides.username ?? 'ana'}@example.com`.toLowerCase() : overrides.email,
        overrides.slug,
      ),
    );

  beforeAll(async () => {
    database = await startTestDatabase('onboarding');
    db = database.db;
  }, 60000);

  afterAll(async () => {
    await database?.destroy();
  });

  it('crea tienda, sucursal, propietario sin PIN, tres roles de sistema, proveedor y cliente genérico', async () => {
    const result = await onboard();

    expect(result.tenant.slug).toBe('ferreteria-el-nandu');
    expect(result.user).toMatchObject({ username: 'ana.duena', isOwner: true });

    const tenantId = result.tenant.id;
    const roles = await db.query(`SELECT name, is_system FROM roles WHERE tenant_id = $1 ORDER BY name`, [tenantId]);
    expect(roles.map((r: { name: string }) => r.name)).toEqual(['Administrador', 'Cajero', 'Gerente / Supervisor']);
    expect(roles.every((r: { is_system: boolean }) => r.is_system)).toBe(true);

    const [owner] = await db.query(`SELECT pin, password FROM users WHERE id = $1`, [result.user.id]);
    expect(owner.pin).toBeNull();
    expect(owner.password).not.toBe('clave-segura-1');

    const links = await db.query(`SELECT 1 FROM user_branches WHERE user_id = $1 AND branch_id = $2`, [result.user.id, result.branch.id]);
    expect(links).toHaveLength(1);
    expect(await db.query(`SELECT 1 FROM suppliers WHERE tenant_id = $1`, [tenantId])).toHaveLength(1);
    expect(await db.query(`SELECT 1 FROM customers WHERE tenant_id = $1`, [tenantId])).toHaveLength(1);
  });

  it('rechaza un RUC ya registrado con TENANT_RUC_TAKEN y no deja nada a medias', async () => {
    const before = await db.getRepository(Tenant).count();
    await expect(onboard({ username: 'otro' })).rejects.toMatchObject({ code: 'TENANT_RUC_TAKEN' });
    expect(await db.getRepository(Tenant).count()).toBe(before);
  });

  it('genera un slug distinto cuando el nombre coincide con otra tienda', async () => {
    const result = await onboard({ ruc: '0991234567002', username: 'segundo' });
    expect(result.tenant.slug).toBe('ferreteria-el-nandu-1');
  });

  it('rechaza un correo que ya usa otra cuenta con EMAIL_TAKEN', async () => {
    await expect(onboard({ ruc: '0991234567004', username: 'repetido', email: 'ana@example.com' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('rechaza un nombre de usuario sin caracteres válidos', async () => {
    await expect(onboard({ ruc: '0991234567003', username: '###' })).rejects.toMatchObject({ code: 'USERNAME_INVALID' });
  });

  it('dos altas simultáneas con el mismo RUC: una gana y la otra recibe TENANT_RUC_TAKEN, no un 500', async () => {
    const results = await Promise.allSettled([
      onboard({ ruc: '0991234567009', username: 'a', slug: 'carrera-a' }),
      onboard({ ruc: '0991234567009', username: 'b', slug: 'carrera-b' }),
    ]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'TENANT_RUC_TAKEN' });
    expect(await db.getRepository(Tenant).countBy({ ruc: '0991234567009' })).toBe(1);
  });
});
