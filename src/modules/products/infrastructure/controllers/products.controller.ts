import { Controller, Post, Get, Put, Delete, Body, Param } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateProductDto } from '../../application/commands/create-product/create-product.dto';
import { CreateProductCommand } from '../../application/commands/create-product/create-product.command';
import { CreateAttributeDto } from '../../application/commands/create-attribute/create-attribute.dto';
import { CreateAttributeCommand } from '../../application/commands/create-attribute/create-attribute.command';
import { CreateAttributeValueDto } from '../../application/commands/create-attribute-value/create-attribute-value.dto';
import { CreateAttributeValueCommand } from '../../application/commands/create-attribute-value/create-attribute-value.command';
import { GetProductsQuery } from '../../application/queries/get-products/get-products.query';
import { GetProductByIdQuery } from '../../application/queries/get-product-by-id/get-product-by-id.query';
import { UpdateProductDto } from '../../application/commands/update-product/update-product.dto';
import { UpdateProductCommand } from '../../application/commands/update-product/update-product.command';
import { DeleteProductCommand } from '../../application/commands/delete-product/delete-product.command';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  async create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.commandBus.execute(
      new CreateProductCommand(tenantId, dto.name, dto.description, dto.variants, dto.imageIds),
    );
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

  @Get()
  async findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetProductsQuery(tenantId));
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
      new UpdateProductCommand(tenantId, id, dto.name, dto.description, dto.imageIds),
    );
  }

  @Delete(':id')
  async remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.commandBus.execute(new DeleteProductCommand(tenantId, id));
  }
}
