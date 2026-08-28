import { Controller, Post, Body, Get, Patch, Param, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateSupplierDto } from '../../application/commands/create-supplier/create-supplier.dto';
import { CreateSupplierCommand } from '../../application/commands/create-supplier/create-supplier.command';
import { RegisterPurchaseDto } from '../../application/commands/register-purchase/register-purchase.dto';
import { RegisterPurchaseCommand } from '../../application/commands/register-purchase/register-purchase.command';
import { CancelPurchaseOrderCommand } from '../../application/commands/cancel-purchase-order/cancel-purchase-order.command';
import { GetSuppliersQuery } from '../../application/queries/get-suppliers/get-suppliers.query';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { ValidateImportPurchasesDto, ImportPurchasesDto } from '../../application/commands/import-purchases/import-purchases.dto';
import { ImportPurchasesCommand } from '../../application/commands/import-purchases/import-purchases.command';
import { ValidateImportPurchasesQuery } from '../../application/queries/validate-import-purchases/validate-import-purchases.query';
import { GetPurchasesQuery } from '../../application/queries/get-purchases/get-purchases.query';
import { GetPurchasesByProductQuery } from '../../application/queries/get-purchases-by-product/get-purchases-by-product.query';

@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('suppliers')
  async createSupplier(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.commandBus.execute(
      new CreateSupplierCommand(
        tenantId,
        dto.identityNumber,
        dto.name,
        dto.email,
        dto.phone,
        dto.address,
      ),
    );
  }

  @Get('suppliers')
  async findSuppliers(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetSuppliersQuery(tenantId));
  }

  @Post()
  async registerPurchase(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: RegisterPurchaseDto,
  ) {
    return this.commandBus.execute(
      new RegisterPurchaseCommand(
        tenantId,
        dto.supplierId,
        dto.branchId,
        dto.invoiceNumber || null,
        dto.items,
      ),
    );
  }

  @Get()
  async getPurchases(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetPurchasesQuery(tenantId));
  }

  @Get('by-product/:productId')
  async getPurchasesByProduct(
    @CurrentUser('tenantId') tenantId: string,
    @Param('productId') productId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.queryBus.execute(new GetPurchasesByProductQuery(
      tenantId,
      productId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
    ));
  }

  @Patch(':id/cancel')
  async cancelPurchase(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') purchaseOrderId: string,
  ) {
    await this.commandBus.execute(
      new CancelPurchaseOrderCommand(tenantId, purchaseOrderId),
    );
    return { message: 'Purchase order cancelled successfully' };
  }

  @Post('validate-import')
  async validateImport(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ValidateImportPurchasesDto,
  ) {
    return this.queryBus.execute(
      new ValidateImportPurchasesQuery(tenantId, dto.items),
    );
  }

  @Post('import')
  async importPurchases(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ImportPurchasesDto,
  ) {
    return this.commandBus.execute(
      new ImportPurchasesCommand(tenantId, dto.branchId, dto.items),
    );
  }
}
