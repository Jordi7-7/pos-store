import { Logger, HttpStatus } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { OnboardTenantCommand } from './onboard-tenant.command';
import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';
import { User } from '../../../../users/domain/entities/user.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { HashService } from '../../../services/hash.service';
import { Supplier } from '../../../../purchases/domain/entities/supplier.entity';
import { Customer } from '../../../../customers/domain/entities/customer.entity';
import { ADMIN_PERMISSIONS, CASHIER_PERMISSIONS, MANAGER_PERMISSIONS } from '../../../domain/default-roles';
import { slugify } from '../../../domain/slugify';
import { isUniqueViolation } from '../../../../../common/errors/database-errors';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(OnboardTenantCommand)
export class OnboardTenantHandler implements ICommandHandler<OnboardTenantCommand> {
  private readonly logger = new Logger(OnboardTenantHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
  ) {}

  async execute(command: OnboardTenantCommand) {
    try {
      return await this.onboard(command);
    } catch (error) {
      // Altas simultáneas pasan las comprobaciones previas: la segunda choca con el índice único
      if (isUniqueViolation(error)) throw this.conflictFor(error, command);
      throw error;
    }
  }

  private conflictFor(error: unknown, command: OnboardTenantCommand): AppException {
    const detail = (error as { detail?: string }).detail ?? '';
    if (detail.includes('(slug)')) {
      return new AppException(ErrorCode.TenantSlugTaken, 'Ese identificador de tienda acaba de ser tomado. Inténtalo de nuevo.', HttpStatus.CONFLICT);
    }
    if (detail.includes('(email)')) {
      return new AppException(ErrorCode.EmailTaken, 'Ese correo ya está registrado en otra cuenta.', HttpStatus.CONFLICT);
    }
    if (detail.includes('(username)')) {
      return new AppException(ErrorCode.UsernameTaken, 'Ese nombre de usuario ya está en uso.', HttpStatus.CONFLICT);
    }
    return new AppException(ErrorCode.TenantRucTaken, `Ya existe una tienda registrada con el RUC ${command.ruc}.`, HttpStatus.CONFLICT, { ruc: command.ruc });
  }

  private async onboard(command: OnboardTenantCommand) {
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
      throw new AppException(ErrorCode.UsernameInvalid, 'El nombre de usuario es obligatorio y debe contener caracteres válidos.', HttpStatus.BAD_REQUEST);
    }
    const cleanEmail = email && email.trim() ? email.toLowerCase().trim() : null;

    this.logger.log(`Onboarding tenant request received for RUC: ${ruc}, Admin Username: ${cleanUsername}`);
    const tenantExists = await this.entityManager.findOne(Tenant, {
      where: { ruc },
    });
    if (tenantExists) {
      this.logger.warn(`Onboarding failed: Tenant RUC ${ruc} already registered`);
      throw new AppException(ErrorCode.TenantRucTaken, `Ya existe una tienda registrada con el RUC ${ruc}.`, HttpStatus.CONFLICT, { ruc });
    }

    return this.entityManager.transaction(async (transactionalManager) => {
      const baseSlug = slugify(command.slug || tenantName) || 'tienda';

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
      const user = new User();
      user.tenantId = savedTenant.id;
      user.name = adminName;
      user.username = cleanUsername;
      user.email = cleanEmail;
      user.password = hashedPassword;
      user.isOwner = true;
      // Sin PIN por defecto: el propietario genera uno propio desde la gestión de usuarios.
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
         ($1, 'Administrador', 'Gestión completa de operaciones, catálogo, usuarios y configuración.', $2, true),
         ($1, 'Gerente / Supervisor', 'Operaciones diarias, inventario, compras, clientes y reportes.', $3, true),
         ($1, 'Cajero', 'Ventas en mostrador, emisión de tickets, turnos de caja y cobros.', $4, true)`,
        [savedTenant.id, ADMIN_PERMISSIONS, MANAGER_PERMISSIONS, CASHIER_PERMISSIONS],
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

      this.logger.log(`Onboarding successful. Created Tenant: ${savedTenant.name} (ID: ${savedTenant.id}), owner user ID: ${savedUser.id}`);

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
