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
import { CONSUMER_FINAL_EMAIL, CONSUMER_FINAL_IDENTITY, CONSUMER_FINAL_NAME, CONSUMER_FINAL_PHONE } from '../../../../customers/domain/consumer-final';

@CommandHandler(OnboardTenantCommand)
export class OnboardTenantHandler implements ICommandHandler<OnboardTenantCommand> {
  private readonly logger = new Logger(OnboardTenantHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly hashService: HashService,
  ) {}

  async execute(command: OnboardTenantCommand): Promise<OnboardingResult> {
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

  private async onboard(command: OnboardTenantCommand): Promise<OnboardingResult> {
    const username = command.username.toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
    if (!username) {
      throw new AppException(ErrorCode.UsernameInvalid, 'El nombre de usuario es obligatorio y debe contener caracteres válidos.', HttpStatus.BAD_REQUEST);
    }
    const email = command.email && command.email.trim() ? command.email.toLowerCase().trim() : null;

    this.logger.log(`Onboarding tenant request received for RUC: ${command.ruc}, Admin Username: ${username}`);
    await this.assertRucAvailable(command.ruc);

    // Todo o nada: una tienda sin propietario o sin roles no debe quedar a medias
    return this.entityManager.transaction(async (manager) => {
      const tenant = await this.createTenant(manager, command);
      const branch = await this.createBranch(manager, tenant, command);
      const owner = await this.createOwner(manager, tenant, branch, command, username, email);
      await this.seedDefaultRoles(manager, tenant.id);
      await this.seedDefaultSupplier(manager, tenant.id);
      await manager.save(this.consumerFinalFor(tenant.id));

      this.logger.log(`Onboarding successful. Created Tenant: ${tenant.name} (ID: ${tenant.id}), owner user ID: ${owner.id}`);
      return toOnboardingResult(tenant, branch, owner);
    });
  }

  private async assertRucAvailable(ruc: string): Promise<void> {
    if (await this.entityManager.findOne(Tenant, { where: { ruc } })) {
      this.logger.warn(`Onboarding failed: Tenant RUC ${ruc} already registered`);
      throw new AppException(ErrorCode.TenantRucTaken, `Ya existe una tienda registrada con el RUC ${ruc}.`, HttpStatus.CONFLICT, { ruc });
    }
  }

  private async createTenant(manager: EntityManager, command: OnboardTenantCommand): Promise<Tenant> {
    const tenant = new Tenant();
    tenant.name = command.tenantName;
    tenant.slug = await this.availableSlug(manager, slugify(command.slug || command.tenantName) || 'tienda');
    tenant.ruc = command.ruc;
    tenant.country = command.country;
    tenant.currencyCode = command.currencyCode;
    tenant.currencySymbol = command.currencySymbol;
    tenant.timezone = command.timezone;
    return manager.save(tenant);
  }

  /** El slug identifica la tienda al iniciar sesión: si ya existe se le añade un número (`tienda`, `tienda-1`...). */
  private async availableSlug(manager: EntityManager, baseSlug: string): Promise<string> {
    let slug = baseSlug;
    for (let counter = 1; await manager.findOne(Tenant, { where: { slug } }); counter++) {
      slug = `${baseSlug}-${counter}`;
    }
    return slug;
  }

  private createBranch(manager: EntityManager, tenant: Tenant, command: OnboardTenantCommand): Promise<Branch> {
    const branch = new Branch();
    branch.tenantId = tenant.id;
    branch.name = command.branchName;
    branch.address = command.branchAddress;
    branch.code = 1;
    branch.isActive = true;
    return manager.save(branch);
  }

  /** El propietario entra con contraseña y opera en la sucursal inicial; el PIN lo genera él después desde Usuarios. */
  private async createOwner(manager: EntityManager, tenant: Tenant, branch: Branch, command: OnboardTenantCommand, username: string, email: string | null): Promise<User> {
    const user = new User();
    user.tenantId = tenant.id;
    user.name = command.adminName;
    user.username = username;
    user.email = email;
    user.password = await this.hashService.hash(command.password);
    user.isOwner = true;
    const owner = await manager.save(user);

    await manager.query(`INSERT INTO "user_branches" ("user_id", "branch_id") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [owner.id, branch.id]);
    return owner;
  }

  private async seedDefaultRoles(manager: EntityManager, tenantId: string): Promise<void> {
    await manager.query(
      `INSERT INTO "roles" ("tenant_id", "name", "description", "permissions", "is_system")
       VALUES
       ($1, 'Administrador', 'Gestión completa de operaciones, catálogo, usuarios y configuración.', $2, true),
       ($1, 'Gerente / Supervisor', 'Operaciones diarias, inventario, compras, clientes y reportes.', $3, true),
       ($1, 'Cajero', 'Ventas en mostrador, emisión de tickets, turnos de caja y cobros.', $4, true)`,
      [tenantId, ADMIN_PERMISSIONS, MANAGER_PERMISSIONS, CASHIER_PERMISSIONS],
    );
  }

  private async seedDefaultSupplier(manager: EntityManager, tenantId: string): Promise<void> {
    const supplier = new Supplier();
    supplier.tenantId = tenantId;
    supplier.identityNumber = 'GENERICO';
    supplier.name = 'PROVEEDOR GENERICO';
    supplier.email = null;
    supplier.phone = null;
    supplier.address = null;
    await manager.save(supplier);
  }

  private consumerFinalFor(tenantId: string): Customer {
    const customer = new Customer();
    customer.tenantId = tenantId;
    customer.identityNumber = CONSUMER_FINAL_IDENTITY;
    customer.name = CONSUMER_FINAL_NAME;
    customer.email = CONSUMER_FINAL_EMAIL;
    customer.phone = CONSUMER_FINAL_PHONE;
    return customer;
  }
}

export interface OnboardingResult {
  tenant: { id: string; name: string; slug: string; ruc: string; timezone: string; currencyCode: string; currencySymbol: string };
  branch: { id: string; name: string };
  user: { id: string; name: string; username: string; email: string | null | undefined; isOwner: true; role: 'OWNER' };
}

function toOnboardingResult(tenant: Tenant, branch: Branch, owner: User): OnboardingResult {
  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      ruc: tenant.ruc,
      timezone: tenant.timezone,
      currencyCode: tenant.currencyCode,
      currencySymbol: tenant.currencySymbol,
    },
    branch: { id: branch.id, name: branch.name },
    user: { id: owner.id, name: owner.name, username: owner.username, email: owner.email, isOwner: true, role: 'OWNER' },
  };
}
