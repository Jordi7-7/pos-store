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
import { ProductBatch } from './domain/entities/product-batch.entity';
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
import { UpdateSimpleProductHandler } from './application/commands/update-simple-product/update-simple-product.handler';
import { UpdateVariantHandler } from './application/commands/update-variant/update-variant.handler';
import { DeleteProductHandler } from './application/commands/delete-product/delete-product.handler';
import { CreateVariantHandler } from './application/commands/create-variant/create-variant.handler';
import { DeleteVariantHandler } from './application/commands/delete-variant/delete-variant.handler';
import { ImportProductsHandler } from './application/commands/import-products/import-products.handler';
import { ImportVariantProductsHandler } from './application/commands/import-variant-products/import-variant-products.handler';
import { ValidateImportProductsHandler } from './application/queries/validate-import-products/validate-import-products.handler';
import { GetAttributesHandler } from './application/queries/get-attributes/get-attributes.handler';
import { GetInventoryMovementsByVariantHandler } from './application/queries/get-inventory-movements-by-variant/get-inventory-movements-by-variant.handler';
import { GetInventoryMovementsHandler } from './application/queries/get-inventory-movements/get-inventory-movements.handler';
import { GetInventoryDocumentHandler } from './application/queries/get-inventory-document/get-inventory-document.handler';
import { GetInventoryDocumentsHandler } from './application/queries/get-inventory-documents/get-inventory-documents.handler';
import { CreateInventoryDocumentHandler } from './application/commands/create-inventory-document/create-inventory-document.handler';
import { CreateStockCountHandler } from './application/commands/create-stock-count/create-stock-count.handler';
import { GetStockCountSheetHandler } from './application/queries/get-stock-count-sheet/get-stock-count-sheet.handler';
import { CreateStockTransferHandler } from './application/commands/create-stock-transfer/create-stock-transfer.handler';
import { InventoryDocument } from './domain/entities/inventory-document.entity';
import { GetTagsHandler } from './application/queries/get-tags/get-tags.handler';
import { CreateTagHandler } from './application/commands/create-tag/create-tag.handler';
import { UpdateVariantTagsHandler } from './application/commands/update-variant-tags/update-variant-tags.handler';
import { FindPosVariantsBySkuHandler } from './application/queries/find-pos-variants-by-sku/find-pos-variants-by-sku.handler';
import { GetPosVariantBySkuHandler } from './application/queries/get-pos-variant-by-sku/get-pos-variant-by-sku.handler';
import { GetPosVariantsByBaseSkuHandler } from './application/queries/get-pos-variants-by-base-sku/get-pos-variants-by-base-sku.handler';
import { GetPosVariantsHandler } from './application/queries/get-pos-variants/get-pos-variants.handler';
import { GetPosCatalogHandler } from './application/queries/get-pos-catalog/get-pos-catalog.handler';
import { GetPosStockHandler } from './application/queries/get-pos-stock/get-pos-stock.handler';
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
      ProductBatch,
      InventoryMovement,
      InventoryDocument,
      ProductImage,
      Category,
      Tag,
    ]),
    CqrsModule,
  ],
  controllers: [ProductsController],
  providers: [
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
    UpdateSimpleProductHandler,
    UpdateVariantHandler,
    DeleteProductHandler,
    CreateVariantHandler,
    DeleteVariantHandler,
    GetInventoryMovementsHandler,
    GetInventoryDocumentHandler,
    GetInventoryDocumentsHandler,
    CreateInventoryDocumentHandler,
    CreateStockCountHandler,
    CreateStockTransferHandler,
    GetStockCountSheetHandler,
    ImportProductsHandler,
    ImportVariantProductsHandler,
    ValidateImportProductsHandler,
    GetAttributesHandler,
    GetInventoryMovementsByVariantHandler,
    GetTagsHandler,
    FindPosVariantsBySkuHandler,
    CreateTagHandler,
    UpdateVariantTagsHandler,
    GetPosVariantBySkuHandler,
    GetPosVariantsByBaseSkuHandler,
    GetPosVariantsHandler,
    GetPosCatalogHandler,
    GetPosStockHandler,
    GetProductsBySkuAndBarcodeHandler,
    GetProductsByNameHandler,
  ],
})
export class ProductsModule {}

