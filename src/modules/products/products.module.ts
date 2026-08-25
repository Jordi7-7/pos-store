import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { Product } from './domain/entities/product.entity';
import { ProductVariant } from './domain/entities/product-variant.entity';
import { Attribute } from './domain/entities/attribute.entity';
import { AttributeValue } from './domain/entities/attribute-value.entity';
import { ProductStock } from './domain/entities/product-stock.entity';
import { InventoryMovement } from './domain/entities/inventory-movement.entity';
import { ProductImage } from './domain/entities/product-image.entity';
import { Category } from './domain/entities/category.entity';
import { Tag } from './domain/entities/tag.entity';
import { CreateProductHandler } from './application/commands/create-product/create-product.handler';
import { CreateSimpleProductHandler } from './application/commands/create-simple-product/create-simple-product.handler';
import { CreateVariableProductHandler } from './application/commands/create-variable-product/create-variable-product.handler';
import { CreateAttributeHandler } from './application/commands/create-attribute/create-attribute.handler';
import { CreateAttributeValueHandler } from './application/commands/create-attribute-value/create-attribute-value.handler';
import { CreateCategoryHandler } from './application/commands/create-category/create-category.handler';
import { GetCategoriesHandler } from './application/queries/get-categories/get-categories.handler';
import { GetProductsHandler } from './application/queries/get-products/get-products.handler';
import { GetProductByIdHandler } from './application/queries/get-product-by-id/get-product-by-id.handler';
import { UpdateProductHandler } from './application/commands/update-product/update-product.handler';
import { DeleteProductHandler } from './application/commands/delete-product/delete-product.handler';
import { CreateVariantHandler } from './application/commands/create-variant/create-variant.handler';
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
      ProductImage,
      Category,
      Tag,
    ]),
    CqrsModule,
  ],
  controllers: [ProductsController],
  providers: [
    CreateProductHandler,
    CreateSimpleProductHandler,
    CreateVariableProductHandler,
    CreateAttributeHandler,
    CreateAttributeValueHandler,
    CreateCategoryHandler,
    GetCategoriesHandler,
    GetProductsHandler,
    GetProductByIdHandler,
    UpdateProductHandler,
    DeleteProductHandler,
    CreateVariantHandler,
  ],
})
export class ProductsModule {}

