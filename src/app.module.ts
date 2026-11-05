import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConnectionOptions } from './config/database.options';

// Import Guards
import { AuthGuard } from './modules/auth/guards/auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

// Import Feature Modules
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductsModule } from './modules/products/products.module';
import { SalesModule } from './modules/sales/sales.module';
import { UsersModule } from './modules/users/users.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { MediaModule } from './modules/media/media.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CustomersModule } from './modules/customers/customers.module';
import { BatchesModule } from './modules/batches/batches.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ReportsModule } from './modules/reports/reports.module';

import { RolesModule } from './modules/roles/roles.module';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard';

import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRoot({
      ...databaseConnectionOptions(),
      logging: process.env.DB_LOGGING === 'all' ? true : process.env.DB_LOGGING === 'true' ? ['error', 'warn', 'migration'] : false,
    }),
    RedisModule,
    AuthModule,
    ProductsModule,
    BatchesModule,
    SalesModule,
    UsersModule,
    RolesModule,
    PurchasesModule,
    MediaModule,
    BranchesModule,
    CustomersModule,
    TenantsModule,
    ReportsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
