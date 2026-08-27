import { Logger, BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { OnboardTenantCommand } from './onboard-tenant.command';
import { Tenant } from '../../../../tenants/domain/entities/tenant.entity';
import { User } from '../../../../users/domain/entities/user.entity';
import { Branch } from '../../../../branches/domain/entities/branch.entity';
import { UserRole } from '../../../../users/enums/user-role.enum';
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
      email,
      password,
      branchName,
      branchAddress,
    } = command;
    this.logger.log(`Onboarding tenant request received for RUC: ${ruc}, Admin: ${email}`);
    const tenantExists = await this.entityManager.findOne(Tenant, {
      where: { ruc },
    });
    if (tenantExists) {
      this.logger.warn(`Onboarding failed: Tenant RUC ${ruc} already registered`);
      throw new BadRequestException(`Tenant with RUC ${ruc} already registered`);
    }

    const userExists = await this.entityManager.findOne(User, {
      where: { email },
    });
    if (userExists) {
      this.logger.warn(`Onboarding failed: email ${email} is already in use`);
      throw new BadRequestException(`Email ${email} is already in use`);
    }

    return this.entityManager.transaction(async (transactionalManager) => {
      // A. Create Tenant
      const tenant = new Tenant();
      tenant.name = tenantName;
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
      branch.isActive = true;
      const savedBranch = await transactionalManager.save(branch);

      // C. Hash Admin Password & Create User
      const hashedPassword = await this.hashService.hash(password);
      const defaultPinHash = await this.hashService.hash('000000');
      const user = new User();
      user.tenantId = savedTenant.id;
      user.name = adminName;
      user.email = email;
      user.password = hashedPassword;
      user.role = UserRole.OWNER;
      user.pin = defaultPinHash;
      user.pinEnabled = true;
      const savedUser = await transactionalManager.save(user);

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
          ruc: savedTenant.ruc,
        },
        branch: {
          id: savedBranch.id,
          name: savedBranch.name,
        },
        user: {
          id: savedUser.id,
          name: savedUser.name,
          email: savedUser.email,
          role: savedUser.role,
        },
      };
    });
  }
}
