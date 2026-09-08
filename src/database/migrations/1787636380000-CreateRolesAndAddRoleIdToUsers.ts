import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRolesAndAddRoleIdToUsers1787636380000 implements MigrationInterface {
  name = 'CreateRolesAndAddRoleIdToUsers1787636380000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create table 'roles' with text[] permissions and multi-tenant support
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "description" text,
        "permissions" text[] NOT NULL DEFAULT '{}',
        "is_system" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_roles_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_roles_tenant_id" ON "roles" ("tenant_id")
    `);

    // 2. Add role_id and custom_permissions to 'users' table
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN "role_id" uuid,
      ADD COLUMN "custom_permissions" text[] DEFAULT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL
    `);

    // 3. Seed default roles for all existing tenants and link existing users
    const tenants: { id: string }[] = await queryRunner.query(`SELECT id FROM "tenants"`);

    for (const tenant of tenants) {
      const tenantId = tenant.id;

      // Create OWNER role
      const ownerRes = await queryRunner.query(
        `INSERT INTO "roles" ("tenant_id", "name", "description", "permissions", "is_system")
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [
          tenantId,
          'Propietario',
          'Acceso total a todas las funciones del sistema y configuración del negocio.',
          ['*'],
        ],
      );
      const ownerRoleId = ownerRes[0].id;

      // Create ADMIN role
      const adminPermissions = [
        'view:dashboard', 'view:pos', 'view:sales', 'view:products', 'view:purchases',
        'view:customers', 'view:cash_sessions', 'view:reports', 'view:users', 'view:media', 'view:settings',
        'action:pos.apply_discount', 'action:sales.refund', 'action:sales.cancel',
        'action:products.create', 'action:products.edit', 'action:products.delete', 'action:products.import', 'action:products.adjust_stock',
        'action:purchases.create', 'action:cash.open_close', 'action:cash.create_expense',
        'action:users.manage', 'action:roles.manage', 'action:reports.export'
      ];
      const adminRes = await queryRunner.query(
        `INSERT INTO "roles" ("tenant_id", "name", "description", "permissions", "is_system")
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [
          tenantId,
          'Administrador',
          'Gestión completa de operaciones, catálogo, usuarios y reportes.',
          adminPermissions,
        ],
      );
      const adminRoleId = adminRes[0].id;

      // Create MANAGER role
      const managerPermissions = [
        'view:dashboard', 'view:pos', 'view:sales', 'view:products', 'view:purchases',
        'view:customers', 'view:cash_sessions', 'view:reports', 'view:media',
        'action:pos.apply_discount', 'action:sales.refund',
        'action:products.create', 'action:products.edit', 'action:products.adjust_stock',
        'action:purchases.create', 'action:cash.open_close', 'action:cash.create_expense',
        'action:reports.export'
      ];
      const managerRes = await queryRunner.query(
        `INSERT INTO "roles" ("tenant_id", "name", "description", "permissions", "is_system")
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [
          tenantId,
          'Gerente / Supervisor',
          'Operaciones del día a día, control de stock, apertura/cierre de cajas y reportes.',
          managerPermissions,
        ],
      );
      const managerRoleId = managerRes[0].id;

      // Create CASHIER role
      const cashierPermissions = [
        'view:pos', 'view:sales', 'view:customers',
        'action:cash.open_close', 'action:cash.create_expense'
      ];
      const cashierRes = await queryRunner.query(
        `INSERT INTO "roles" ("tenant_id", "name", "description", "permissions", "is_system")
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [
          tenantId,
          'Cajero',
          'Ventas en mostrador, emisión de tickets, cobros y arqueos de caja diaria.',
          cashierPermissions,
        ],
      );
      const cashierRoleId = cashierRes[0].id;

      // Link existing users to the newly seeded roles according to their old role string
      await queryRunner.query(
        `UPDATE "users" SET "role_id" = $1 WHERE "tenant_id" = $2 AND ("role" = 'OWNER' OR "role" = 'owner')`,
        [ownerRoleId, tenantId],
      );
      await queryRunner.query(
        `UPDATE "users" SET "role_id" = $1 WHERE "tenant_id" = $2 AND ("role" = 'ADMIN' OR "role" = 'admin')`,
        [adminRoleId, tenantId],
      );
      await queryRunner.query(
        `UPDATE "users" SET "role_id" = $1 WHERE "tenant_id" = $2 AND ("role" = 'MANAGER' OR "role" = 'manager')`,
        [managerRoleId, tenantId],
      );
      await queryRunner.query(
        `UPDATE "users" SET "role_id" = $1 WHERE "tenant_id" = $2 AND ("role" = 'CASHIER' OR "role" = 'cashier')`,
        [cashierRoleId, tenantId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_role"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "custom_permissions"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role_id"`);
    await queryRunner.query(`DROP TABLE "roles"`);
  }
}
