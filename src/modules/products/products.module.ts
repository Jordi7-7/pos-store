import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Product } from './domain/entities/product.entity';
import { ProductVariant } from './domain/entities/product-variant.entity';
import { Attribute } from './domain/entities/attribute.entity';
import { AttributeValue } from './domain/entities/attribute-value.entity';
import { ProductStock } from './domain/entities/product-stock.entity';
import { InventoryMovement } from './domain/entities/inventory-movement.entity';
import { CreateProductHandler } from './application/commands/create-product/create-product.handler';
import { CreateAttributeHandler } from './application/commands/create-attribute/create-attribute.handler';
import { CreateAttributeValueHandler } from './application/commands/create-attribute-value/create-attribute-value.handler';
import { GetProductsHandler } from './application/queries/get-products/get-products.handler';
import { GetProductByIdHandler } from './application/queries/get-product-by-id/get-product-by-id.handler';
import { UpdateProductHandler } from './application/commands/update-product/update-product.handler';
import { DeleteProductHandler } from './application/commands/delete-product/delete-product.handler';
import { ProductsController } from './infrastructure/controllers/products.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductVariant,
      Attribute,
      AttributeValue,
      ProductStock,
      InventoryMovement,
    ]),
    CqrsModule,
  ],
  controllers: [ProductsController],
  providers: [
    CreateProductHandler,
    CreateAttributeHandler,
    CreateAttributeValueHandler,
    GetProductsHandler,
    GetProductByIdHandler,
    UpdateProductHandler,
    DeleteProductHandler,
  ],
})
export class ProductsModule {}
