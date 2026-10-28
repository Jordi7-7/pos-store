import { Logger, BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { OnboardTenantCommand } from './onboard-tenant.command';
import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';
import { User } from '../../../../users/domain/entities/user.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { HashService } from '../../../services/hash.service';
import { Supplier } from '../../../../purchases/domain/entities/supplier.entity';
import { Customer } from '../../../../customers/domain/entities/customer.entity';
import { APP_PERMISSIONS } from '../../../../../common/enums/permissions.enum';

@CommandHandler(OnboardTenantCommand)
export class OnboardTenantHandler implements ICommandHandler<OnboardTenantCommand> {
  private readonly logger = new Logger(OnboardTenantHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
  ) {}

  async execute(command: OnboardTenantCommand) {
    const {
      tenantName,
      ruc,
      country,
      currencyCode,
      currencySymbol,
      timezone,
      adminName,
      username,
      email,
      password,
      branchName,
      branchAddress,
    } = command;

    const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
    if (!cleanUsername) {
      throw new BadRequestException('El nombre de usuario es obligatorio y debe contener caracteres válidos.');
    }
    const cleanEmail = email && email.trim() ? email.toLowerCase().trim() : null;

    this.logger.log(`Onboarding tenant request received for RUC: ${ruc}, Admin Username: ${cleanUsername}`);
    const tenantExists = await this.entityManager.findOne(Tenant, {
      where: { ruc },
    });
    if (tenantExists) {
      this.logger.warn(`Onboarding failed: Tenant RUC ${ruc} already registered`);
      throw new BadRequestException(`Tenant with RUC ${ruc} already registered`);
    }

    return this.entityManager.transaction(async (transactionalManager) => {
      // Helper function to sanitize a slug
      const sanitizeSlug = (str: string): string => {
        return str
          .toLowerCase()
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with hyphens
          .replace(/^-+|-+$/g, '');        // Trim leading/trailing hyphens
      };

      const baseSlug = command.slug
        ? sanitizeSlug(command.slug)
        : sanitizeSlug(tenantName) || 'tienda';

      let cleanSlug = baseSlug;
      let counter = 1;

      // Ensure slug uniqueness across tenants
      while (await transactionalManager.findOne(Tenant, { where: { slug: cleanSlug } })) {
        cleanSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      // A. Create Tenant
      const tenant = new Tenant();
      tenant.name = tenantName;
      tenant.slug = cleanSlug;
      tenant.ruc = ruc;
      tenant.country = country;
      tenant.currencyCode = currencyCode;
      tenant.currencySymbol = currencySymbol;
      tenant.timezone = timezone;
      const savedTenant = await transactionalManager.save(tenant);

      // B. Create Default Branch
      const branch = new Branch();
      branch.tenantId = savedTenant.id;
      branch.name = branchName;
      branch.address = branchAddress;
      branch.code = 1;
      branch.isActive = true;
      const savedBranch = await transactionalManager.save(branch);

      // C. Hash Admin Password & Create User
      const hashedPassword = await this.hashService.hash(password);
      const defaultPinHash = await this.hashService.hash('000000');
      const user = new User();
      user.tenantId = savedTenant.id;
      user.name = adminName;
      user.username = cleanUsername;
      user.email = cleanEmail;
      user.password = hashedPassword;
      user.isOwner = true;
      user.pin = defaultPinHash;
      const savedUser = await transactionalManager.save(user);

      // Link owner user to the initial branch in user_branches
      await transactionalManager.query(
        `INSERT INTO "user_branches" ("user_id", "branch_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [savedUser.id, savedBranch.id],
      );

      // Seed default system roles for the new tenant
      const adminPermissions = Array.from(
        new Set(
          Object.entries(APP_PERMISSIONS)
            .filter(([key]) => !['ROLES_MANAGE', 'BRANCHES_MANAGE', 'USERS_MANAGE', 'CASH_REGISTERS_MANAGE'].includes(key))
            .map(([, val]) => val)
        )
      );

      const managerPermissions = [
        // Vistas de interfaz
        APP_PERMISSIONS.VIEW_DASHBOARD,
        APP_PERMISSIONS.VIEW_POS,
        APP_PERMISSIONS.VIEW_SALES,
        APP_PERMISSIONS.VIEW_PRODUCTS,
        APP_PERMISSIONS.VIEW_CATEGORIES,
        APP_PERMISSIONS.VIEW_ATTRIBUTES,
        APP_PERMISSIONS.VIEW_PURCHASES,
        APP_PERMISSIONS.VIEW_SUPPLIERS,
        APP_PERMISSIONS.VIEW_CASH_SESSIONS,
        APP_PERMISSIONS.VIEW_CASH_REGISTERS,
        APP_PERMISSIONS.VIEW_CUSTOMERS,
        APP_PERMISSIONS.VIEW_MEDIA,
        APP_PERMISSIONS.VIEW_REPORTS,

        // Acciones GET (consultas a API)
        APP_PERMISSIONS.DASHBOARD_GET,
        APP_PERMISSIONS.SALES_GET,
        APP_PERMISSIONS.PRODUCTS_GET,
        APP_PERMISSIONS.CATEGORIES_GET,
        APP_PERMISSIONS.ATTRIBUTES_GET,
        APP_PERMISSIONS.PURCHASES_GET,
        APP_PERMISSIONS.SUPPLIERS_GET,
        APP_PERMISSIONS.CASH_SESSIONS_GET,
        APP_PERMISSIONS.CASH_REGISTERS_GET,
        APP_PERMISSIONS.CUSTOMERS_GET,
        APP_PERMISSIONS.MEDIA_GET,
        APP_PERMISSIONS.REPORTS_GET,

        // Acciones operativas
        APP_PERMISSIONS.POS_SELL,
        APP_PERMISSIONS.POS_APPLY_DISCOUNT,
        APP_PERMISSIONS.SALES_REFUND,
        APP_PERMISSIONS.PRODUCTS_CREATE,
        APP_PERMISSIONS.PRODUCTS_EDIT,
        APP_PERMISSIONS.PRODUCTS_ADJUST_STOCK,
        APP_PERMISSIONS.PRODUCTS_IMPORT,
        APP_PERMISSIONS.PRODUCTS_PRINT_BARCODES,
        APP_PERMISSIONS.CATEGORIES_CREATE,
        APP_PERMISSIONS.CATEGORIES_EDIT,
        APP_PERMISSIONS.ATTRIBUTES_CREATE,
        APP_PERMISSIONS.ATTRIBUTES_EDIT,
        APP_PERMISSIONS.PURCHASES_CREATE,
        APP_PERMISSIONS.PURCHASES_IMPORT,
        APP_PERMISSIONS.SUPPLIERS_CREATE,
        APP_PERMISSIONS.SUPPLIERS_EDIT,
        APP_PERMISSIONS.CASH_OPEN_CLOSE,
        APP_PERMISSIONS.CASH_CREATE_EXPENSE,
        APP_PERMISSIONS.CUSTOMERS_CREATE,
        APP_PERMISSIONS.CUSTOMERS_EDIT,
        APP_PERMISSIONS.MEDIA_UPLOAD,
        APP_PERMISSIONS.REPORTS_EXPORT,
      ];

      const cashierPermissions = [
        // Vistas de interfaz
        APP_PERMISSIONS.VIEW_POS,
        APP_PERMISSIONS.VIEW_SALES,

        // Acciones GET requeridas para operar el POS
        APP_PERMISSIONS.PRODUCTS_GET,
        APP_PERMISSIONS.CATEGORIES_GET,
        APP_PERMISSIONS.CUSTOMERS_GET,
        APP_PERMISSIONS.CASH_REGISTERS_GET,
        APP_PERMISSIONS.CASH_SESSIONS_GET,
        APP_PERMISSIONS.SALES_GET,

        // Acciones operativas del cajero
        APP_PERMISSIONS.POS_SELL,
        APP_PERMISSIONS.POS_APPLY_DISCOUNT,
        APP_PERMISSIONS.CASH_OPEN_CLOSE,
        APP_PERMISSIONS.CASH_CREATE_EXPENSE,
        APP_PERMISSIONS.CUSTOMERS_CREATE,
      ];

      await transactionalManager.query(
        `INSERT INTO "roles" ("tenant_id", "name", "description", "permissions", "is_system")
         VALUES 
         ($1, 'Administrador', 'Gestión completa de operaciones, catálogo, usuarios y configuración.', $2, true),
         ($1, 'Gerente / Supervisor', 'Operaciones diarias, inventario, compras, clientes y reportes.', $3, true),
         ($1, 'Cajero', 'Ventas en mostrador, emisión de tickets, turnos de caja y cobros.', $4, true)`,
        [savedTenant.id, adminPermissions, managerPermissions, cashierPermissions],
      );

      // D. Create Default Supplier
      const supplier = new Supplier();
      supplier.tenantId = savedTenant.id;
      supplier.identityNumber = 'GENERICO';
      supplier.name = 'PROVEEDOR GENERICO';
      supplier.email = null;
      supplier.phone = null;
      supplier.address = null;
      await transactionalManager.save(supplier);

      // E. Create Default Customer (Consumidor Final)
      const customer = new Customer();
      customer.tenantId = savedTenant.id;
      customer.identityNumber = '9999999999999';
      customer.name = 'CONSUMIDOR FINAL';
      customer.email = 'consumidorfinal@example.com';
      customer.phone = '9999999999';
      await transactionalManager.save(customer);

      this.logger.log(`Onboarding successful. Created Tenant: ${savedTenant.name} (ID: ${savedTenant.id}), User OWNER: ${savedUser.email}`);

      return {
        tenant: {
          id: savedTenant.id,
          name: savedTenant.name,
          slug: savedTenant.slug,
          ruc: savedTenant.ruc,
          timezone: savedTenant.timezone,
          currencyCode: savedTenant.currencyCode,
          currencySymbol: savedTenant.currencySymbol,
        },
        branch: {
          id: savedBranch.id,
          name: savedBranch.name,
        },
        user: {
          id: savedUser.id,
          name: savedUser.name,
          username: savedUser.username,
          email: savedUser.email,
          isOwner: true,
          role: 'OWNER',
        },
      };
    });
  }
}
