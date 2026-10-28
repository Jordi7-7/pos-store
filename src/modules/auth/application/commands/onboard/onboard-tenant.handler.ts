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
      await transactionalManager.query(
        `INSERT INTO "roles" ("tenant_id", "name", "description", "permissions", "is_system")
         VALUES 
         ($1, 'Administrador', 'Gestión completa de operaciones, catálogo, usuarios y reportes.', $2, true),
         ($1, 'Gerente / Supervisor', 'Operaciones del día a día, control de stock y reportes.', $3, true),
         ($1, 'Cajero', 'Ventas en mostrador, emisión de tickets y cobros.', $4, true)`,
        [
          savedTenant.id,
          [
            'view:dashboard', 'view:pos', 'view:sales', 'view:products', 'view:purchases',
            'view:customers', 'view:cash_sessions', 'view:reports', 'view:users', 'view:media', 'view:settings',
            'action:pos.apply_discount', 'action:sales.refund', 'action:sales.cancel',
            'action:products.create', 'action:products.edit', 'action:products.delete', 'action:products.import', 'action:products.adjust_stock',
            'action:purchases.create', 'action:cash.open_close', 'action:cash.create_expense',
            'action:users.manage', 'action:roles.manage', 'action:reports.export'
          ],
          [
            'view:dashboard', 'view:pos', 'view:sales', 'view:products', 'view:purchases',
            'view:customers', 'view:cash_sessions', 'view:reports', 'view:media',
            'action:pos.apply_discount', 'action:sales.refund',
            'action:products.create', 'action:products.edit', 'action:products.adjust_stock',
            'action:purchases.create', 'action:cash.open_close', 'action:cash.create_expense',
            'action:reports.export'
          ],
          [
            'view:pos', 'view:sales', 'view:customers',
            'action:cash.open_close', 'action:cash.create_expense'
          ]
        ]
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
