import { Controller, Post, Get, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateVariableProductDto, ProductVariantDto, CreateSimpleProductDto } from '../dtos/create-product.dto';
import { CreateSimpleProductCommand } from '../../application/commands/create-simple-product/create-simple-product.command';
import { CreateVariableProductCommand } from '../../application/commands/create-variable-product/create-variable-product.command';
import { CreateVariantCommand } from '../../application/commands/create-variant/create-variant.command';
import { CreateAttributeDto } from '../dtos/create-attribute.dto';
import { CreateAttributeCommand } from '../../application/commands/create-attribute/create-attribute.command';
import { CreateAttributeValueDto } from '../dtos/create-attribute-value.dto';
import { CreateAttributeValueCommand } from '../../application/commands/create-attribute-value/create-attribute-value.command';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { CreateCategoryCommand } from '../../application/commands/create-category/create-category.command';
import { GetCategoriesQuery } from '../../application/queries/get-categories/get-categories.query';
import { GetProductsQuery } from '../../application/queries/get-products/get-products.query';
import { GetProductByIdQuery } from '../../application/queries/get-product-by-id/get-product-by-id.query';
import { GetVariantBySkuQuery } from '../../application/queries/get-variant-by-sku/get-variant-by-sku.query';
import { GetPosVariantsQuery } from '../../application/queries/get-pos-variants/get-pos-variants.query';
import { GetPosCatalogQuery } from '../../application/queries/get-pos-catalog/get-pos-catalog.query';
import { PosCatalogPage } from '../../application/read-models/pos-catalog';
import { GetPosStockQuery } from '../../application/queries/get-pos-stock/get-pos-stock.query';
import { PosStockPage } from '../../application/read-models/pos-stock';
import { UpdateProductDto } from '../dtos/update-product.dto';
import { UpdateProductCommand } from '../../application/commands/update-product/update-product.command';
import { UpdateSimpleProductDto } from '../dtos/update-simple-product.dto';
import { UpdateSimpleProductCommand } from '../../application/commands/update-simple-product/update-simple-product.command';
import { UpdateVariantDto } from '../dtos/update-variant.dto';
import { UpdateVariantCommand } from '../../application/commands/update-variant/update-variant.command';
import { DeleteProductCommand } from '../../application/commands/delete-product/delete-product.command';
import { DeleteVariantCommand } from '../../application/commands/delete-variant/delete-variant.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AdjustStockDto } from '../dtos/adjust-stock.dto';
import { AdjustStockCommand } from '../../application/commands/adjust-stock/adjust-stock.command';
import { ValidateImportProductsDto, ImportProductsDto } from '../dtos/import-products.dto';
import { ImportProductsCommand } from '../../application/commands/import-products/import-products.command';
import { ValidateImportProductsQuery } from '../../application/queries/validate-import-products/validate-import-products.query';
import { GetAttributesQuery } from '../../application/queries/get-attributes/get-attributes.query';
import { GetInventoryMovementsByVariantQuery } from '../../application/queries/get-inventory-movements-by-variant/get-inventory-movements-by-variant.query';
import { GetTagsQuery } from '../../application/queries/get-tags/get-tags.query';
import { CreateTagCommand } from '../../application/commands/create-tag/create-tag.command';
import { UpdateVariantTagsCommand } from '../../application/commands/update-variant-tags/update-variant-tags.command';
import { Product } from '../../domain/entities/product.entity';
import { ProductVariant } from '../../domain/entities/product-variant.entity';
import { Category } from '../../domain/entities/category.entity';
import { Attribute } from '../../domain/entities/attribute.entity';
import { AttributeValue } from '../../domain/entities/attribute-value.entity';
import { Tag } from '../../domain/entities/tag.entity';
import { PaginatedProductsResponseDto } from '../../application/read-models/product-response';
import { PosVariantListItem, VariantLookupResponse } from '../../application/read-models/pos-variant-response';
import { FindPosVariantsBySkuQuery } from '../../application/queries/find-pos-variants-by-sku/find-pos-variants-by-sku.query';
import { PosSkuSearchResult } from '../../application/queries/find-pos-variants-by-sku/find-pos-variants-by-sku.handler';
import { InventoryMovementsPage } from '../../application/queries/get-inventory-movements-by-variant/get-inventory-movements-by-variant.handler';
import { AdjustStockResult } from '../../application/commands/adjust-stock/adjust-stock.handler';
import { ImportValidationResult } from '../../application/queries/validate-import-products/validate-import-products.handler';
import { ImportProductsResult } from '../../application/commands/import-products/import-products.handler';
import { CreateTagDto, UpdateVariantTagsDto } from '../dtos/tag.dto';
import { parseLimit, parsePage } from '../../../../common/utils/pagination';
import { RequirePermissions, RequireAnyPermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('simple')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_CREATE)
  async createSimple(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateSimpleProductDto,
  ) {
    return this.commandBus.execute<CreateSimpleProductCommand, Product>(
      new CreateSimpleProductCommand(
        tenantId,
        dto.name,
        dto.description,
        dto.sku,
        dto.barcode || '',
        dto.purchasePrice,
        dto.salePrice,
        dto.wholesalePrice !== undefined ? Number(dto.wholesalePrice) : undefined,
        dto.categoryId,
        dto.imageIds,
        dto.stocks,
      ),
    );
  }

  @Post('variable')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_CREATE)
  async createVariable(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateVariableProductDto,
  ) {
    return this.commandBus.execute<CreateVariableProductCommand, Product>(
      new CreateVariableProductCommand(
        tenantId,
        dto.name,
        dto.description,
        dto.variants,
        dto.imageIds,
        dto.categoryId,
        dto.baseSku,
      ),
    );
  }




  @Post(':productId/variants')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_CREATE)
  async createVariant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('productId') productId: string,
    @Body() dto: ProductVariantDto,
  ) {
    return this.commandBus.execute<CreateVariantCommand, ProductVariant>(
      new CreateVariantCommand(tenantId, productId, dto),
    );
  }

  @Post('categories')
  @RequirePermissions(APP_PERMISSIONS.CATEGORIES_CREATE)
  async createCategory(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.commandBus.execute<CreateCategoryCommand, Category>(
      new CreateCategoryCommand(tenantId, dto.name),
    );
  }

  @Get('categories')
  @RequirePermissions(APP_PERMISSIONS.CATEGORIES_GET)
  async findCategories(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute<GetCategoriesQuery, Category[]>(new GetCategoriesQuery(tenantId));
  }

  @Post('attributes')
  @RequirePermissions(APP_PERMISSIONS.ATTRIBUTES_CREATE)
  async createAttribute(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateAttributeDto,
  ) {
    return this.commandBus.execute<CreateAttributeCommand, Attribute>(
      new CreateAttributeCommand(tenantId, dto.name),
    );
  }

  @Post('attributes/values')
  @RequirePermissions(APP_PERMISSIONS.ATTRIBUTES_CREATE)
  async createAttributeValue(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateAttributeValueDto,
  ) {
    return this.commandBus.execute<CreateAttributeValueCommand, AttributeValue>(
      new CreateAttributeValueCommand(tenantId, dto.attributeId, dto.value),
    );
  }

  @Get('attributes')
  @RequirePermissions(APP_PERMISSIONS.ATTRIBUTES_GET)
  async findAttributes(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute<GetAttributesQuery, Attribute[]>(new GetAttributesQuery(tenantId));
  }

  @Get()
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_GET)
  async find(
    @CurrentUser('tenantId') tenantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('branchId') branchId?: string,
    @Query('inStockOnly') inStockOnly?: string | boolean,
  ) {
    const p = page ? Number(page) : undefined;
    const l = limit ? Number(limit) : undefined;
    const b = branchId || undefined;
    const inStock = inStockOnly === 'true' || inStockOnly === true;

    return this.queryBus.execute<GetProductsQuery, PaginatedProductsResponseDto>(
      new GetProductsQuery(tenantId, p, l, search, type, b, inStock),
    );
  }

  @Get('inventory-movements-by-variant')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_GET)
  async getMovementsByVariant(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Query('variantId') variantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute<GetInventoryMovementsByVariantQuery, InventoryMovementsPage>(new GetInventoryMovementsByVariantQuery(
      tenantId,
      variantId,
      parsePage(page),
      parseLimit(limit),
      branchId || undefined,
      userId,
      isOwner,
    ));
  }

  @Post('stock-adjustments')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_ADJUST_STOCK)
  async adjustStock(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.commandBus.execute<AdjustStockCommand, AdjustStockResult>(
      new AdjustStockCommand(
        tenantId,
        userId,
        dto.branchId,
        dto.variantId,
        dto.quantity,
        dto.type,
        dto.comment,
      ),
    );
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  @Get('tags')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_GET)
  async findTags(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute<GetTagsQuery, Tag[]>(new GetTagsQuery(tenantId));
  }

  @Post('tags')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_CREATE)
  async createTag(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateTagDto,
  ) {
    return this.commandBus.execute<CreateTagCommand, Tag>(new CreateTagCommand(tenantId, dto.name));
  }

  @Get('variant/sku/:sku')
  @RequireAnyPermissions(
    APP_PERMISSIONS.PRODUCTS_GET,
    APP_PERMISSIONS.PURCHASES_CREATE,
    APP_PERMISSIONS.PURCHASES_GET,
  )
  async findVariantBySku(
    @CurrentUser('tenantId') tenantId: string,
    @Param('sku') sku: string,
  ) {
    return this.queryBus.execute<GetVariantBySkuQuery, VariantLookupResponse>(new GetVariantBySkuQuery(tenantId, sku));
  }

  @Get('pos/variant/sku/:sku')
  @RequireAnyPermissions(APP_PERMISSIONS.PRODUCTS_GET, APP_PERMISSIONS.POS_SELL)
  async findPosVariantBySku(
    @CurrentUser('tenantId') tenantId: string,
    @Param('sku') sku: string,
    @Query('branchId') branchId: string,
  ) {
    return this.queryBus.execute<FindPosVariantsBySkuQuery, PosSkuSearchResult>(
      new FindPosVariantsBySkuQuery(tenantId, sku, branchId),
    );
  }

  @Get('pos/variants')
  @RequireAnyPermissions(APP_PERMISSIONS.PRODUCTS_GET, APP_PERMISSIONS.POS_SELL)
  async findPosVariants(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
  ) {
    return this.queryBus.execute<GetPosVariantsQuery, PosVariantListItem[]>(new GetPosVariantsQuery(tenantId, branchId));
  }

  /**
   * Catálogo para vender sin conexión, por lotes y por cambios: sin `after` baja todo; con el `cursor` de la
   * descarga anterior solo trae lo modificado o borrado desde entonces. Repetir mientras `hasMore` sea true.
   */
  @Get('pos/catalog')
  @RequireAnyPermissions(APP_PERMISSIONS.PRODUCTS_GET, APP_PERMISSIONS.POS_SELL)
  async getPosCatalog(
    @CurrentUser('tenantId') tenantId: string,
    @Query('after') after?: string,
    @Query('limit') limit?: number,
  ): Promise<PosCatalogPage> {
    return this.queryBus.execute<GetPosCatalogQuery, PosCatalogPage>(new GetPosCatalogQuery(tenantId, after, limit));
  }

  /**
   * Existencias de una sucursal para vender sin conexión, por lotes y por cambios (mismo cursor que el catálogo).
   * Cada sucursal tiene su propio stock: se baja solo el de `branchId`, y solo si el usuario tiene acceso a ella.
   */
  @Get('pos/stock')
  @RequireAnyPermissions(APP_PERMISSIONS.PRODUCTS_GET, APP_PERMISSIONS.POS_SELL)
  async getPosStock(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Query('branchId', new ParseUUIDPipe()) branchId: string,
    @Query('after') after?: string,
    @Query('limit') limit?: number,
  ): Promise<PosStockPage> {
    return this.queryBus.execute<GetPosStockQuery, PosStockPage>(new GetPosStockQuery(tenantId, branchId, userId, isOwner, after, limit));
  }

  @Get(':id')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_GET)
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.queryBus.execute<GetProductByIdQuery, Product>(new GetProductByIdQuery(tenantId, id));
  }

  @Put(':id/simple')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_EDIT)
  async updateSimple(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSimpleProductDto,
  ) {
    return this.commandBus.execute<UpdateSimpleProductCommand, Product>(
      new UpdateSimpleProductCommand(
        tenantId,
        id,
        dto.name,
        dto.description,
        dto.categoryId,
        dto.imageIds,
        dto.sku,
        dto.barcode,
        dto.purchasePrice,
        dto.salePrice,
        dto.wholesalePrice,
      ),
    );
  }

  @Put(':id')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_EDIT)
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.commandBus.execute<UpdateProductCommand, Product>(
      new UpdateProductCommand(tenantId, id, dto.name, dto.description, dto.imageIds, dto.categoryId, dto.baseSku),
    );
  }


  @Put('variants/:variantId')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_EDIT)
  async updateVariant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.commandBus.execute<UpdateVariantCommand, ProductVariant>(
      new UpdateVariantCommand(
        tenantId,
        variantId,
        dto.sku,
        dto.barcode,
        dto.purchasePrice,
        dto.salePrice,
        dto.wholesalePrice,
        dto.imageIds,
      ),
    );
  }

  @Delete(':id')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_DELETE)
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    await this.commandBus.execute<DeleteProductCommand, void>(new DeleteProductCommand(tenantId, id));
    return { success: true, message: 'Producto eliminado correctamente' };
  }

  @Delete('variants/:variantId')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_DELETE)
  async removeVariant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('variantId') variantId: string,
  ) {
    await this.commandBus.execute<DeleteVariantCommand, void>(new DeleteVariantCommand(tenantId, variantId));
    return { success: true, message: 'Variante eliminada correctamente' };
  }

  @Put('variants/:variantId/tags')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_EDIT)
  async updateVariantTags(
    @CurrentUser('tenantId') tenantId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantTagsDto,
  ) {
    return this.commandBus.execute<UpdateVariantTagsCommand, ProductVariant>(
      new UpdateVariantTagsCommand(tenantId, variantId, dto.tagIds),
    );
  }

  @Post('validate-import')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_IMPORT)
  async validateImport(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ValidateImportProductsDto,
  ) {
    return this.queryBus.execute<ValidateImportProductsQuery, ImportValidationResult>(
      new ValidateImportProductsQuery(tenantId, dto.items),
    );
  }

  @Post('import')
  @RequirePermissions(APP_PERMISSIONS.PRODUCTS_IMPORT)
  async importProducts(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: ImportProductsDto,
  ) {
    return this.commandBus.execute<ImportProductsCommand, ImportProductsResult>(
      new ImportProductsCommand(tenantId, userId, dto.branchId, dto.items),
    );
  }
}

