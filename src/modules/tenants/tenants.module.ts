import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Tenant } from './domain/entities/tenant.entity';
import { TenantsController } from './infrastructure/controllers/tenants.controller';
import { GetTenantHandler } from './application/queries/get-tenant/get-tenant.handler';
import { GetTenantMetadataHandler } from './application/queries/get-tenant-metadata/get-tenant-metadata.handler';
import { UpdateTenantHandler } from './application/commands/update-tenant/update-tenant.handler';

const Handlers = [
  GetTenantHandler,
  GetTenantMetadataHandler,
  UpdateTenantHandler,
];

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Tenant]),
  ],
  providers: [...Handlers],
  controllers: [TenantsController],
})
export class TenantsModule {}
