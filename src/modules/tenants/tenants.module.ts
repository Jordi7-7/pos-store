import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './domain/entities/tenant.entity';
import { TenantsService } from './application/services/tenants.service';
import { TenantsController } from './infrastructure/controllers/tenants.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [TenantsService],
  controllers: [TenantsController],
  exports: [TenantsService],
})
export class TenantsModule {}
