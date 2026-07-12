import { Controller, Post, Get, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { Attribute } from '../../domain/entities/attribute.entity';
import { CreateProductDto } from '../../application/commands/create-product/create-product.dto';
import { CreateProductCommand } from '../../application/commands/create-product/create-product.command';
import { CreateAttributeDto } from '../../application/commands/create-attribute/create-attribute.dto';
import { CreateAttributeCommand } from '../../application/commands/create-attribute/create-attribute.command';
import { CreateAttributeValueDto } from '../../application/commands/create-attribute-value/create-attribute-value.dto';
import { CreateAttributeValueCommand } from '../../application/commands/create-attribute-value/create-attribute-value.command';
import { CreateCategoryDto } from '../../application/commands/create-category/create-category.dto';
import { CreateCategoryCommand } from '../../application/commands/create-category/create-category.command';
import { GetCategoriesQuery } from '../../application/queries/get-categories/get-categories.query';
import { GetProductsQuery } from '../../application/queries/get-products/get-products.query';
import { GetProductByIdQuery } from '../../application/queries/get-product-by-id/get-product-by-id.query';
import { UpdateProductDto } from '../../application/commands/update-product/update-product.dto';
import { UpdateProductCommand } from '../../application/commands/update-product/update-product.command';
import { DeleteProductCommand } from '../../application/commands/delete-product/delete-product.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { InventoryMovement } from '../../domain/entities/inventory-movement.entity';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly entityManager: EntityManager,
  ) {}

  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.commandBus.execute(
      new CreateProductCommand(tenantId, dto.name, dto.description, dto.variants, dto.imageIds, dto.categoryId),
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
    const repo = this.entityManager.getRepository(Attribute);
    return repo.find({
      where: { tenantId },
      relations: {
        values: true
      },
    });
  }

  @Get()
  async findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.queryBus.execute(
      new GetProductsQuery(
        tenantId,
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined,
        search
      )
    );
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

  @Get('inventory-movements')
  async getMovements(
    @CurrentUser('tenantId') tenantId: string,
    @Query('variantId') variantId?: string,
  ) {
    const repo = this.entityManager.getRepository(InventoryMovement);
    const where: any = { tenantId };
    if (variantId) {
      where.variantId = variantId;
    }
    return repo.find({
      where,
      relations: {
        variant: { product: true },
        originBranch: true,
        destinationBranch: true,
      },
      order: { createdAt: 'DESC' },
    });
  }
}
