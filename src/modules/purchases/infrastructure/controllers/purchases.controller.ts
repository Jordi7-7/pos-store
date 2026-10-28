import { Controller, Post, Put, Delete, Body, Get, Patch, Param, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateSupplierDto } from '../../application/commands/create-supplier/create-supplier.dto';
import { CreateSupplierCommand } from '../../application/commands/create-supplier/create-supplier.command';
import { UpdateSupplierDto } from '../../application/commands/update-supplier/update-supplier.dto';
import { UpdateSupplierCommand } from '../../application/commands/update-supplier/update-supplier.command';
import { DeleteSupplierCommand } from '../../application/commands/delete-supplier/delete-supplier.command';
import { RegisterPurchaseDto } from '../../application/commands/register-purchase/register-purchase.dto';
import { RegisterPurchaseCommand } from '../../application/commands/register-purchase/register-purchase.command';
import { CancelPurchaseOrderCommand } from '../../application/commands/cancel-purchase-order/cancel-purchase-order.command';
import { GetSuppliersQuery } from '../../application/queries/get-suppliers/get-suppliers.query';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { ValidateImportPurchasesDto, ImportPurchasesDto } from '../../application/commands/import-purchases/import-purchases.dto';
import { ImportPurchasesCommand } from '../../application/commands/import-purchases/import-purchases.command';
import { ValidateImportPurchasesQuery } from '../../application/queries/validate-import-purchases/validate-import-purchases.query';
import { GetPurchasesQuery } from '../../application/queries/get-purchases/get-purchases.query';
import { GetPurchasesByVariantQuery } from '../../application/queries/get-purchases-by-variant/get-purchases-by-variant.query';
import { RequirePermissions, RequireAnyPermissions } from '../../../auth/decorators/permissions.decorator';
import { APP_PERMISSIONS } from '../../../../common/enums/permissions.enum';

@Controller('purchases')
export class PurchasesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('suppliers')
  @RequirePermissions(APP_PERMISSIONS.SUPPLIERS_CREATE)
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
  @RequireAnyPermissions(APP_PERMISSIONS.SUPPLIERS_GET, APP_PERMISSIONS.PURCHASES_CREATE)
  async findSuppliers(@CurrentUser('tenantId') tenantId: string) {
    return this.queryBus.execute(new GetSuppliersQuery(tenantId));
  }

  @Put('suppliers/:id')
  @RequirePermissions(APP_PERMISSIONS.SUPPLIERS_EDIT)
  async updateSupplier(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.commandBus.execute(new UpdateSupplierCommand(tenantId, id, dto));
  }

  @Delete('suppliers/:id')
  @RequirePermissions(APP_PERMISSIONS.SUPPLIERS_DELETE)
  async deleteSupplier(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.commandBus.execute(new DeleteSupplierCommand(tenantId, id));
  }

  @Post()
  @RequirePermissions(APP_PERMISSIONS.PURCHASES_CREATE)
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
  @RequirePermissions(APP_PERMISSIONS.PURCHASES_GET)
  async getPurchases(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('supplierId') supplierId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.queryBus.execute(
      new GetPurchasesQuery(
        tenantId,
        branchId || undefined,
        userId,
        isOwner,
        startDate,
        endDate,
        supplierId || undefined,
        page ? Number(page) : 1,
        limit ? Number(limit) : 10,
      ),
    );
  }

  @Get('by-variant/:variantId')
  @RequireAnyPermissions(APP_PERMISSIONS.PRODUCTS_GET, APP_PERMISSIONS.PURCHASES_GET)
  async getPurchasesByVariant(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('isOwner') isOwner: boolean,
    @Param('variantId') variantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.queryBus.execute(new GetPurchasesByVariantQuery(
      tenantId,
      variantId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
      branchId || undefined,
      userId,
      isOwner,
    ));
  }

  @Patch(':id/cancel')
  @RequirePermissions(APP_PERMISSIONS.PURCHASES_CANCEL)
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
  @RequirePermissions(APP_PERMISSIONS.PURCHASES_IMPORT)
  async validateImport(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ValidateImportPurchasesDto,
  ) {
    return this.queryBus.execute(
      new ValidateImportPurchasesQuery(tenantId, dto.items),
    );
  }

  @Post('import')
  @RequirePermissions(APP_PERMISSIONS.PURCHASES_IMPORT)
  async importPurchases(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ImportPurchasesDto,
  ) {
    return this.commandBus.execute(
      new ImportPurchasesCommand(tenantId, dto.branchId, dto.items, dto.invoiceNumber, dto.supplierId),
    );
  }
}
