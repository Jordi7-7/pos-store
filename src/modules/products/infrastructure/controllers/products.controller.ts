import { Controller, Post, Get, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateVariableProductDto, ProductVariantDto, CreateSimpleProductDto } from '../../application/commands/create-product/create-product.dto';
import { CreateProductCommand } from '../../application/commands/create-product/create-product.command';
import { CreateSimpleProductCommand } from '../../application/commands/create-simple-product/create-simple-product.command';
import { CreateVariableProductCommand } from '../../application/commands/create-variable-product/create-variable-product.command';
import { CreateVariantCommand } from '../../application/commands/create-variant/create-variant.command';
import { CreateAttributeDto } from '../../application/commands/create-attribute/create-attribute.dto';
import { CreateAttributeCommand } from '../../application/commands/create-attribute/create-attribute.command';
import { CreateAttributeValueDto } from '../../application/commands/create-attribute-value/create-attribute-value.dto';
import { CreateAttributeValueCommand } from '../../application/commands/create-attribute-value/create-attribute-value.command';
import { CreateCategoryDto } from '../../application/commands/create-category/create-category.dto';
import { CreateCategoryCommand } from '../../application/commands/create-category/create-category.command';
import { GetCategoriesQuery } from '../../application/queries/get-categories/get-categories.query';
import { GetProductsQuery } from '../../application/queries/get-products/get-products.query';
import { GetProductsBySkuAndBarcodeQuery } from '../../application/queries/get-products-by-sku-and-barcode/get-products-by-sku-and-barcode.query';
import { GetProductsByNameQuery } from '../../application/queries/get-products-by-name/get-products-by-name.query';
import { GetProductByIdQuery } from '../../application/queries/get-product-by-id/get-product-by-id.query';
import { GetVariantBySkuQuery } from '../../application/queries/get-variant-by-sku/get-variant-by-sku.query';
import { GetPosVariantBySkuQuery } from '../../application/queries/get-pos-variant-by-sku/get-pos-variant-by-sku.query';
import { GetPosVariantsQuery } from '../../application/queries/get-pos-variants/get-pos-variants.query';
import { UpdateProductDto } from '../../application/commands/update-product/update-product.dto';
import { UpdateProductCommand } from '../../application/commands/update-product/update-product.command';
import { DeleteProductCommand } from '../../application/commands/delete-product/delete-product.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AdjustStockDto } from '../../application/commands/adjust-stock/adjust-stock.dto';
import { AdjustStockCommand } from '../../application/commands/adjust-stock/adjust-stock.command';
import { ValidateImportProductsDto, ImportProductsDto } from '../../application/commands/import-products/import-products.dto';
import { ImportProductsCommand } from '../../application/commands/import-products/import-products.command';
import { ValidateImportProductsQuery } from '../../application/queries/validate-import-products/validate-import-products.query';
import { GetAttributesQuery } from '../../application/queries/get-attributes/get-attributes.query';
import { GetInventoryMovementsQuery } from '../../application/queries/get-inventory-movements/get-inventory-movements.query';
import { GetInventoryMovementsByVariantQuery } from '../../application/queries/get-inventory-movements-by-variant/get-inventory-movements-by-variant.query';
import { GetTagsQuery } from '../../application/queries/get-tags/get-tags.query';
import { CreateTagCommand } from '../../application/commands/create-tag/create-tag.command';
import { UpdateVariantTagsCommand } from '../../application/commands/update-variant-tags/update-variant-tags.command';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateVariableProductDto,
  ) {
    return this.commandBus.execute(
      new CreateProductCommand(tenantId, dto.name, dto.description, dto.variants, dto.imageIds, dto.categoryId),
    );
  }

  @Post('simple')
  async createSimple(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateSimpleProductDto,
  ) {
    return this.commandBus.execute(
      new CreateSimpleProductCommand(
        tenantId,
        dto.name,
        dto.description,
        dto.sku,
        dto.barcode || '',
        dto.purchasePrice,
        dto.salePrice,
        dto.categoryId,
        dto.imageIds,
        dto.stocks,
      ),
    );
  }

  @Post('variable')
  async createVariable(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateVariableProductDto,
  ) {
    return this.commandBus.execute(
      new CreateVariableProductCommand(
        tenantId,
        dto.name,
        dto.description,
        dto.variants,
        dto.imageIds,
        dto.categoryId,
      ),
    );
  }



  @Post(':productId/variants')
  async createVariant(
    @CurrentUser('tenantId') tenantId: string,
    @Param('productId') productId: string,
    @Body() dto: ProductVariantDto,
  ) {
    return this.commandBus.execute(
      new CreateVariantCommand(tenantId, productId, dto),
    );
  }

  @Post('categories')
  async createCategory(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.commandBus.execute(
      new CreateCategoryCommand(tenantId, dto.name),
    );
  }

  @Get('categories')
  async findCategories(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetCategoriesQuery(tenantId));
  }

  @Post('attributes')
  async createAttribute(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateAttributeDto,
  ) {
    return this.commandBus.execute(
      new CreateAttributeCommand(tenantId, dto.name),
    );
  }

  @Post('attributes/values')
  async createAttributeValue(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateAttributeValueDto,
  ) {
    return this.commandBus.execute(
      new CreateAttributeValueCommand(tenantId, dto.attributeId, dto.value),
    );
  }

  @Get('attributes')
  async findAttributes(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetAttributesQuery(tenantId));
  }

  @Get()
  async find(
    @CurrentUser('tenantId') tenantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    const p = page ? Number(page) : undefined;
    const l = limit ? Number(limit) : undefined;

    if (search && search.trim() !== '') {
      const codeResult = await this.queryBus.execute(
        new GetProductsBySkuAndBarcodeQuery(tenantId, search, p, l),
      );

      if (codeResult && codeResult.meta && codeResult.meta.total > 0) {
        return codeResult;
      }

      return this.queryBus.execute(
        new GetProductsByNameQuery(tenantId, search, p, l),
      );
    }

    return this.queryBus.execute(
      new GetProductsQuery(tenantId, p, l),
    );
  }

  @Get('inventory-movements')
  async getMovements(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.queryBus.execute(new GetInventoryMovementsQuery(
      tenantId,
      branchId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    ));
  }

  @Get('inventory-movements-by-variant')
  async getMovementsByVariant(
    @CurrentUser('tenantId') tenantId: string,
    @Query('variantId') variantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.queryBus.execute(new GetInventoryMovementsByVariantQuery(
      tenantId,
      variantId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    ));
  }

  @Post('stock-adjustments')
  async adjustStock(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.commandBus.execute(
      new AdjustStockCommand(
        tenantId,
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
  async findTags(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetTagsQuery(tenantId));
  }

  @Post('tags')
  async createTag(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: { name: string },
  ) {
    return this.commandBus.execute(new CreateTagCommand(tenantId, body.name));
  }

  @Get('variant/sku/:sku')
  async findVariantBySku(
    @CurrentUser('tenantId') tenantId: string,
    @Param('sku') sku: string,
  ) {
    return this.queryBus.execute(new GetVariantBySkuQuery(tenantId, sku));
  }

  @Get('pos/variant/sku/:sku')
  async findPosVariantBySku(
    @CurrentUser('tenantId') tenantId: string,
    @Param('sku') sku: string,
    @Query('branchId') branchId: string,
  ) {
    return this.queryBus.execute(new GetPosVariantBySkuQuery(tenantId, sku, branchId));
  }

  @Get('pos/variants')
  async findPosVariants(
    @CurrentUser('tenantId') tenantId: string,
    @Query('branchId') branchId: string,
  ) {
    return this.queryBus.execute(new GetPosVariantsQuery(tenantId, branchId));
  }

  @Get(':id')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.queryBus.execute(new GetProductByIdQuery(tenantId, id));
  }

  @Put(':id')
  async update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.commandBus.execute(
      new UpdateProductCommand(tenantId, id, dto.name, dto.description, dto.imageIds, dto.categoryId, dto.variants),
    );
  }

  @Delete(':id')
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.commandBus.execute(new DeleteProductCommand(tenantId, id));
  }

  @Put('variants/:variantId/tags')
  async updateVariantTags(
    @CurrentUser('tenantId') tenantId: string,
    @Param('variantId') variantId: string,
    @Body() body: { tagIds: string[] },
  ) {
    return this.commandBus.execute(
      new UpdateVariantTagsCommand(tenantId, variantId, body.tagIds),
    );
  }

  @Post('validate-import')
  async validateImport(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ValidateImportProductsDto,
  ) {
    return this.queryBus.execute(
      new ValidateImportProductsQuery(tenantId, dto.items),
    );
  }

  @Post('import')
  async importProducts(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ImportProductsDto,
  ) {
    return this.commandBus.execute(
      new ImportProductsCommand(tenantId, dto.branchId, dto.items),
    );
  }
}

