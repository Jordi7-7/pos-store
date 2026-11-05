import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager, Not } from 'typeorm';
import { Logger, HttpStatus } from '@nestjs/common';
import { UpdateTenantCommand } from './update-tenant.command';
import { Tenant } from '../../../domain/entities/tenant.entity';
import { S3Service } from '../../../../media/services/s3.service';
import getSymbolFromCurrency from 'currency-symbol-map';
import { AppException } from '../../../../../common/errors/app.exception';
import { ErrorCode } from '../../../../../common/errors/error-codes';

@CommandHandler(UpdateTenantCommand)
export class UpdateTenantHandler implements ICommandHandler<UpdateTenantCommand> {
  private readonly logger = new Logger(UpdateTenantHandler.name);

  constructor(
    private readonly entityManager: EntityManager,
    private readonly s3Service: S3Service,
  ) {}

  async execute(command: UpdateTenantCommand): Promise<Tenant> {
    const { id, input } = command;
    const tenant = await this.entityManager.findOne(Tenant, { where: { id } });
    if (!tenant) {
      throw new AppException(ErrorCode.TenantNotFound, 'Tienda no encontrada.', HttpStatus.NOT_FOUND, { id });
    }

    if (input.name !== undefined) {
      tenant.name = input.name;
    }
    if (input.slug !== undefined) {
      const cleanSlug = input.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const existingSlugTenant = await this.entityManager.findOne(Tenant, {
        where: { slug: cleanSlug, id: Not(id) },
      });
      if (existingSlugTenant) {
        throw new AppException(ErrorCode.TenantSlugTaken, `El identificador "${cleanSlug}" ya está en uso por otra tienda`, HttpStatus.CONFLICT, { slug: cleanSlug });
      }
      tenant.slug = cleanSlug;
    }
    if (input.logoUrl !== undefined) {
      const newLogoUrl = input.logoUrl ? input.logoUrl.trim() : null;
      if (newLogoUrl) {
        // El logo debe vivir en el espacio de almacenamiento del propio tenant
        this.s3Service.assertBelongsToTenant(id, newLogoUrl);
      }
      // If logo changed and there was an old logo in the bucket, delete the previous file
      if (tenant.logoUrl && tenant.logoUrl !== newLogoUrl && this.s3Service.belongsToTenant(id, tenant.logoUrl)) {
        try {
          this.logger.log(`Deleting previous tenant logo from S3/bucket: ${tenant.logoUrl}`);
          await this.s3Service.deleteFile(tenant.logoUrl);
        } catch (err) {
          this.logger.warn(`Failed to delete previous logo from S3 bucket: ${err}`);
        }
      }
      tenant.logoUrl = newLogoUrl;
    }
    if (input.country !== undefined) {
      tenant.country = input.country;
    }
    if (input.currencyCode !== undefined) {
      tenant.currencyCode = input.currencyCode;
      const symbol = getSymbolFromCurrency(input.currencyCode);
      tenant.currencySymbol = symbol || '$';
    }
    if (input.timezone !== undefined) {
      tenant.timezone = input.timezone;
    }

    return this.entityManager.save(Tenant, tenant);
  }
}
