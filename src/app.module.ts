import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantMiddleware } from './common/tenant/tenant.middleware';

// Import Guards
import { AuthGuard } from './modules/auth/guards/auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

// Import Entities
import { Tenant } from './modules/tenants/domain/entities/tenant.entity';
import { User } from './modules/users/domain/entities/user.entity';
import { Branch } from './modules/branches/domain/entities/branch.entity';
import { Customer } from './modules/customers/domain/entities/customer.entity';
import { Product } from './modules/products/domain/entities/product.entity';
import { ProductVariant } from './modules/products/domain/entities/product-variant.entity';
import { Attribute } from './modules/products/domain/entities/attribute.entity';
import { AttributeValue } from './modules/products/domain/entities/attribute-value.entity';
import { ProductStock } from './modules/products/domain/entities/product-stock.entity';
import { InventoryMovement } from './modules/products/domain/entities/inventory-movement.entity';
import { CashSession } from './modules/sales/domain/entities/cash-session.entity';
import { Sale } from './modules/sales/domain/entities/sale.entity';
import { SaleItem } from './modules/sales/domain/entities/sale-item.entity';
import { SalePayment } from './modules/sales/domain/entities/sale-payment.entity';
import { Expense } from './modules/sales/domain/entities/expense.entity';
import { Refund } from './modules/sales/domain/entities/refund.entity';
import { RefundItem } from './modules/sales/domain/entities/refund-item.entity';

// Import Feature Modules
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductsModule } from './modules/products/products.module';
import { SalesModule } from './modules/sales/sales.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'pos_store',
      entities: [
        Tenant,
        User,
        Branch,
        Customer,
        Product,
        ProductVariant,
        Attribute,
        AttributeValue,
        ProductStock,
        InventoryMovement,
        CashSession,
        Sale,
        SaleItem,
        SalePayment,
        Expense,
        Refund,
        RefundItem,
      ],
      synchronize: false,
      logging: process.env.DB_LOGGING === 'true',
    }),
    RedisModule,
    AuthModule,
    ProductsModule,
    SalesModule,
    UsersModule,
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: '/', method: RequestMethod.GET },
        { path: '/health', method: RequestMethod.GET },
        { path: '/auth/onboard', method: RequestMethod.POST },
        { path: '/auth/login', method: RequestMethod.POST },
        { path: '/auth/refresh', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
