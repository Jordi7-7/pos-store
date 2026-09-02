import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Tenant } from './domain/entities/tenant.entity';
import { TenantsController } from './infrastructure/controllers/tenants.controller';
import { GetTenantHandler } from './application/queries/get-tenant/get-tenant.handler';
import { GetTenantMetadataHandler } from './application/queries/get-tenant-metadata/get-tenant-metadata.handler';
import { GetPublicTenantBySlugHandler } from './application/queries/get-public-tenant-by-slug/get-public-tenant-by-slug.handler';
import { UpdateTenantHandler } from './application/commands/update-tenant/update-tenant.handler';
import { MediaModule } from '../media/media.module';

const Handlers = [
  GetTenantHandler,
  GetTenantMetadataHandler,
  GetPublicTenantBySlugHandler,
  UpdateTenantHandler,
];

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Tenant]),
    MediaModule,
  ],
  providers: [...Handlers],
  controllers: [TenantsController],
})
export class TenantsModule {}
