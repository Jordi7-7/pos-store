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
import { GetVariantBySkuHandler } from './application/queries/get-variant-by-sku/get-variant-by-sku.handler';
import { UpdateProductHandler } from './application/commands/update-product/update-product.handler';
import { DeleteProductHandler } from './application/commands/delete-product/delete-product.handler';
import { CreateVariantHandler } from './application/commands/create-variant/create-variant.handler';
import { AdjustStockHandler } from './application/commands/adjust-stock/adjust-stock.handler';
import { ImportProductsHandler } from './application/commands/import-products/import-products.handler';
import { ValidateImportProductsHandler } from './application/queries/validate-import-products/validate-import-products.handler';
import { GetAttributesHandler } from './application/queries/get-attributes/get-attributes.handler';
import { GetInventoryMovementsHandler } from './application/queries/get-inventory-movements/get-inventory-movements.handler';
import { GetInventoryMovementsByVariantHandler } from './application/queries/get-inventory-movements-by-variant/get-inventory-movements-by-variant.handler';
import { GetTagsHandler } from './application/queries/get-tags/get-tags.handler';
import { CreateTagHandler } from './application/commands/create-tag/create-tag.handler';
import { UpdateVariantTagsHandler } from './application/commands/update-variant-tags/update-variant-tags.handler';
import { GetPosVariantBySkuHandler } from './application/queries/get-pos-variant-by-sku/get-pos-variant-by-sku.handler';
import { GetPosVariantsHandler } from './application/queries/get-pos-variants/get-pos-variants.handler';
import { GetProductsBySkuAndBarcodeHandler } from './application/queries/get-products-by-sku-and-barcode/get-products-by-sku-and-barcode.handler';
import { GetProductsByNameHandler } from './application/queries/get-products-by-name/get-products-by-name.handler';
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
    GetVariantBySkuHandler,
    UpdateProductHandler,
    DeleteProductHandler,
    CreateVariantHandler,
    AdjustStockHandler,
    ImportProductsHandler,
    ValidateImportProductsHandler,
    GetAttributesHandler,
    GetInventoryMovementsHandler,
    GetInventoryMovementsByVariantHandler,
    GetTagsHandler,
    CreateTagHandler,
    UpdateVariantTagsHandler,
    GetPosVariantBySkuHandler,
    GetPosVariantsHandler,
    GetProductsBySkuAndBarcodeHandler,
    GetProductsByNameHandler,
  ],
})
export class ProductsModule {}

